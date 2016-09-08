import {flatten as flattenOptions, Some, Option} from 'monapt';
import {StoreEnhancer, StoreCreator, Reducer, Action, Store} from 'redux';
import {flattenDeep as flattenDeepArrays} from 'lodash';

// Tasks represent a job which results in success | error
// Cmd represents a job which results in an action

// http://guide.elm-lang.org/effect_managers/batching.html
// http://package.elm-lang.org/packages/elm-lang/core/latest/Platform-Cmd#batch
// https://github.com/redux-loop/redux-loop/pull/69/files#diff-cb03f5868274bee764df3e04d233383dR35
// https://github.com/evancz/elm-architecture-tutorial/blob/2936ab64702293a0ce41ab4ed9c2344f7f1a4de6/nesting/4-gif-list.elm

export type Cmd<A extends Action> = () => Promise<A[]>;
export const Cmd = {
    batch: (cmds: Cmd<Action>[]): Cmd<Action> => (
        () => Promise.all(cmds.map(fn => fn())).then(flattenDeepArrays)
    )
}

type EnhancedReducer<State> = <A extends Action>(state: State, action: A) => [State, Option<Cmd<A>>];
type EnhancedReducersMapObject = {
    [key: string]: EnhancedReducer<any>;
}

type EnhancedStoreCreator<S> = <A extends Action>(reducer: EnhancedReducer<S>, initialState: S, enhancer?: StoreEnhancer<S>) => Store<S>
type Enhancer<S> = (originalStoreCreator: StoreCreator) => EnhancedStoreCreator<S>;

const liftReducer = <A extends Action, S>(reducer: EnhancedReducer<S>, callback: (cmd: Cmd<A>) => void): Reducer<S> => {
    return (state: S, action: A) => {
        const [newState, maybeCommand] = reducer(state, action);
        maybeCommand.foreach(callback)
        return newState;
    }
}

const createSubject = <T>() => {
    type Subscriber = (t: T) => any;
    const subscribers: Subscriber[] = [];
    const subscribe = (subscriber: Subscriber) => subscribers.push(subscriber)
    const onNext = (t: T) => subscribers.forEach(fn => fn(t));
    return { onNext, subscribe }
}

export const install = <S>(): Enhancer<S> => {
    return (originalCreateStore): EnhancedStoreCreator<S> => {
        return <A extends Action>(reducer: EnhancedReducer<S>, initialState: S, enhancer?: StoreEnhancer<S>) => {
            // This subject represents a stream of cmds coming from
            // the reducer
            const subject = createSubject<Cmd<A>>();
            const liftedReducer = liftReducer(reducer, subject.onNext)
            const store = originalCreateStore(liftedReducer, initialState, enhancer)
            // Close the loop by running the command and dispatching to the
            // store
            subject.subscribe(cmd => cmd().then(actions => actions.forEach(store.dispatch)));

            return store;
        }
    }
}

type Task<SuccessResult, ErrorResult> = () => Promise<SuccessResult | ErrorResult>
type CreateActionFn<Msg, Action> = (msg: Msg) => Action;
// http://package.elm-lang.org/packages/elm-lang/core/latest/Task#perform
export const performTask = <SuccessAction extends Action, ErrorAction extends Action, SuccessResult, ErrorResult>(
    createSuccessAction: CreateActionFn<SuccessResult, SuccessAction>,
    createErrorAction: CreateActionFn<ErrorResult, ErrorAction>,
	task: Task<SuccessResult, ErrorResult>
): Cmd<SuccessAction | ErrorAction> => {
    return () => task().then(createSuccessAction, createErrorAction)
}

// http://package.elm-lang.org/packages/evancz/elm-http/latest/Http#get
export const httpGet = <Success>(decoder: (x: any) => Success, url: string, fetchOptions?: RequestInit): Task<Success, Error> => (
    () => (
        fetch(url, fetchOptions)
            .then(response => response.json())
            .then(decoder)
    )
);

// https://github.com/redux-loop/redux-loop/blob/c708d98a9960d9efe3accc3acbc8f86c940941fa/modules/combineReducers.js
export function combineReducers(reducerMap: EnhancedReducersMapObject): EnhancedReducer<any> {
    return function finalReducer(state: any, action: Action): [any, Option<Cmd<Action>>] {
        type Accumulator = {
            state: any,
            commands: Option<Cmd<Action>>[]
            hasChanged: boolean
        };
        const model = Object.keys(reducerMap).reduce<Accumulator>((acc, key) => {
            const reducer = reducerMap[key];
            const previousStateForKey = state[key];
            const nextResultForKey = reducer(previousStateForKey, action);
            const [nextStateForKey, maybeCommand] = nextResultForKey;

            acc.hasChanged = acc.hasChanged || nextStateForKey !== previousStateForKey;
            acc.state[key] = nextStateForKey;
            acc.commands.push(maybeCommand);
            return acc;
        }, {
            state: {},
            commands: [],
            hasChanged: false
        });

        return [model.state, new Some(Cmd.batch(flattenOptions(model.commands)))];
    };
}
