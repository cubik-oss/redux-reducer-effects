import {Option} from 'monapt';
import {StoreEnhancer, StoreCreator, Reducer, Action, Store} from 'redux';

export type Cmd<A extends Action> = () => Promise<A>;
type EnhancedReducer<A extends Action, State> = (state: State, action: A) => [State, Option<Cmd<A>>];

type EnhancedStoreCreator<A extends Action, S> = (reducer: EnhancedReducer<A, S>, initialState: S, enhancer?: StoreEnhancer<S>) => Store<S>
type Enhancer<A extends Action, S> = (originalStoreCreator: StoreCreator) => EnhancedStoreCreator<A, S>;

const liftReducer = <A extends Action, S>(reducer: EnhancedReducer<A, S>, callback: (cmd: Cmd<A>) => void): Reducer<S> => {
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

export const install = <A extends Action, S>(): Enhancer<A, S> => {
    return (originalCreateStore): EnhancedStoreCreator<A, S> => {
        return (reducer, initialState, enhancer) => {
            // This subject represents a stream of cmds coming from
            // the reducer
            const subject = createSubject<Cmd<A>>();
            const liftedReducer = liftReducer(reducer, subject.onNext)
            const store = originalCreateStore(liftedReducer, initialState, enhancer)
            // Close the loop by running the command and dispatching to the
            // store
            subject.subscribe(command => command().then(store.dispatch));

            return store;
        }
    }
}

type Task<SuccessMsg, ErrorMsg> = () => Promise<SuccessMsg | ErrorMsg>
type CreateActionFn<Msg, Action> = (msg: Msg) => Action;
export const performTask = <SuccessAction extends Action, ErrorAction extends Action, SuccessMsg, ErrorMsg>(
    createSuccessAction: CreateActionFn<SuccessMsg, SuccessAction>,
    createErrorAction: CreateActionFn<ErrorMsg, ErrorAction>,
    task: Task<SuccessMsg, ErrorMsg>): Cmd<SuccessAction | ErrorAction> => {
    return () => task().then(createSuccessAction, createErrorAction)
}

export const httpGet = (url: string): Task<string, string> => (
    () => (
        fetch(url)
            .then(response => (
                response.ok
                    ? response.json().then(json => JSON.stringify(json, null, '\t'))
                    : Promise.resolve('bad response')
            ))
    )
);
