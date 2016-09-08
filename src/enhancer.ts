import {flatten as flattenOptions, Some, Option} from 'monapt';
import {StoreEnhancer, StoreCreator, Reducer, Action} from 'redux';
import {flattenDeep as flattenDeepArrays} from 'lodash';

// Tasks represent a job which results in success | error
// Cmd represents a job which results in an action

// http://guide.elm-lang.org/effect_managers/batching.html
// http://package.elm-lang.org/packages/elm-lang/core/latest/Platform-Cmd#batch
// https://github.com/redux-loop/redux-loop/pull/69/files#diff-cb03f5868274bee764df3e04d233383dR35
// https://github.com/evancz/elm-architecture-tutorial/blob/2936ab64702293a0ce41ab4ed9c2344f7f1a4de6/nesting/4-gif-list.elm

// https://github.com/elm-lang/core/blob/568b384720995ce35b9561fab89f2c0b63c2c3fc/src/Task.elm#L275
// export type Cmd<Msg> = Task<never, Msg>;
export type Cmd<Msg> = () => Promise<Msg>;
export const Cmd = {
    // https://github.com/elm-lang/core/blob/568b384720995ce35b9561fab89f2c0b63c2c3fc/src/Platform/Cmd.elm#L52
    batch: <Msg>(cmds: Cmd<Msg>[]): Cmd<Msg> => (
        // https://github.com/Microsoft/TypeScript/issues/10785
        () => Promise.all(cmds.map(fn => fn()))
    )
}

type EnhancedReducer<State> = <Msg>(state: State, msg: Msg) => [State, Option<Cmd<Msg>>];
type EnhancedReducersMapObject = {
    [key: string]: EnhancedReducer<any>;
}

const liftReducer = <Msg, S>(reducer: EnhancedReducer<S>, callback: (cmd: Cmd<Msg>) => void): Reducer<S> => {
    return (state: S, msg: Msg) => {
        const [newState, maybeCommand] = reducer(state, msg);
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

export const install = (originalCreateStore: StoreCreator) => {
    return <S>(reducer: EnhancedReducer<S>, initialState: S, enhancer?: StoreEnhancer<S>) => {
        // This subject represents a stream of cmds coming from
        // the reducer
        const subject = createSubject<Cmd<Action>>();
        const liftedReducer = liftReducer(reducer, subject.onNext)
        const store = originalCreateStore(liftedReducer, initialState, enhancer)
        // Close the loop by running the command and dispatching to the
        // store
        // TODO: if list, etc.
        subject.subscribe(cmd => cmd().then(msg => {
            if (Array.isArray(msg)) {
                const msgs: Action[] = msg;
                flattenDeepArrays(msgs).forEach(store.dispatch)
            } else {
                store.dispatch(msg)
            }
        }));

        return store;
    }
}

type TaskError<X> = { success: false, value: X }
type TaskSuccess<A> = { success: true, value: A }
type TaskResult<X, A> = TaskError<X> | TaskSuccess<A>;

const createTaskError = <X>(x: X): TaskError<X> => ({ success: false, value: x })
const createTaskSuccess = <A>(a: A): TaskSuccess<A> => ({ success: true, value: a })

type Task<X, A> = () => Promise<TaskResult<X, A>>
// https://github.com/elm-lang/core/blob/568b384720995ce35b9561fab89f2c0b63c2c3fc/src/Task.elm#L285
// http://package.elm-lang.org/packages/elm-lang/core/latest/Task#perform
export const performTask = <X, A, Msg>(
    onFail: (x: X) => Msg,
    onSuccess: (a: A) => Msg,
    task: Task<X, A>
): Cmd<Msg> => (
    // https://github.com/Microsoft/TypeScript/issues/10785
    () => task().then(value => (
        value.success ? onSuccess(value.value) : onFail(value.value)
    ))
);

// http://package.elm-lang.org/packages/evancz/elm-http/latest/Http#get
export const httpGet = <Value>(decoder: (x: any) => Value, url: string, fetchOptions?: RequestInit): Task<Value, Error> => (
    () => (
        fetch(url, fetchOptions)
            .then(response => response.json())
            .then(decoder)
            .then(createTaskSuccess)
            .catch(createTaskError)
    )
);

type Dictionary<T> = { [index: string]: T; }
// https://github.com/redux-loop/redux-loop/blob/c708d98a9960d9efe3accc3acbc8f86c940941fa/modules/combineReducers.js
export const combineReducers = <S>(reducerMap: EnhancedReducersMapObject): EnhancedReducer<S> => {
    return <Msg>(state: Dictionary<any>, msg: Msg): [S, Option<Cmd<Msg>>] => {
        type Accumulator = {
            state: any,
            commands: Option<Cmd<Msg>>[]
            hasChanged: boolean
        };
        const model = Object.keys(reducerMap).reduce<Accumulator>((acc, key) => {
            const reducer = reducerMap[key];
            // We lose type safety here because state is a record
            const previousStateForKey = state[key];
            const nextResultForKey = reducer(previousStateForKey, msg);
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
