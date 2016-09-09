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
// https://github.com/elm-lang/core/blob/568b384720995ce35b9561fab89f2c0b63c2c3fc/src/Platform/Cmd.elm
enum CmdTypes { Single, Batch };
export type SingleCmd<X, A, Msg> = {
    type: CmdTypes.Single
    onFail: (x: X) => Msg,
    onSuccess: (a: A) => Msg,
    task: FetchTask<X, A>
}
type BatchCmd<Msg> = {
    type: CmdTypes.Batch
    cmds: Cmd<any, any, Msg>[]
};
export type Cmd<X, A, Msg> = BatchCmd<Msg> | SingleCmd<X, A, Msg>
export const Cmd = {
    batch: <Msg>(cmds: Cmd<any, any, Msg>[]): BatchCmd<Msg> => (
        { type: CmdTypes.Batch, cmds }
    )
}

type EnhancedReducer<State> = <Msg>(state: State, msg: Msg) => [State, Option<Cmd<any, any, Msg>>];
type EnhancedReducersMapObject = {
    [key: string]: EnhancedReducer<any>;
}

const liftReducer = <Msg, S>(reducer: EnhancedReducer<S>, callback: (cmd: Cmd<any, any, Msg>) => void): Reducer<S> => {
    return (state: S, msg: Msg) => {
        const [newState, maybeCommand] = reducer(state, msg);
        maybeCommand.foreach(callback)
        return newState;
    }
}

function createSubject <T>() {
    type Subscriber = (t: T) => any;
    const subscribers: Subscriber[] = [];
    const subscribe = (subscriber: Subscriber) => subscribers.push(subscriber)
    const onNext = (t: T) => subscribers.forEach(fn => fn(t));
    const map = <A>(mapper: (t: T) => A) => {
        const newSubject = createSubject<A>();
        subscribe(t => newSubject.onNext(mapper(t)))
        return newSubject;
    }
    return { onNext, subscribe, map }
}

type TaskError<X> = { success: false, value: X }
type TaskSuccess<A> = { success: true, value: A }
export type TaskResult<X, A> = TaskError<X> | TaskSuccess<A>;

export const createTaskError = <X>(x: X): TaskError<X> => ({ success: false, value: x })
export const createTaskSuccess = <A>(a: A): TaskSuccess<A> => ({ success: true, value: a })

type DecoderFn = <Value>(x: any) => Value;
type FetchTask<X, A> = {
    type: 'fetch',
    url: string,
    fetchOptions?: RequestInit,
    decoder: DecoderFn
};
export type Task<X, A> = FetchTask<X, A>;

export type TaskRunner = <X, A>(task: Task<X, A>) => Promise<TaskResult<X, A>>;

function cmdRunner <Msg>(taskRunner: TaskRunner, cmd: Cmd<any, any, Msg>): Promise<Msg | Msg[]> {
    switch (cmd.type) {
        case CmdTypes.Single:
            return taskRunner(cmd.task)
                .then(result => (
                    result.success ? cmd.onSuccess(result.value) : cmd.onFail(result.value)
                ))
        case CmdTypes.Batch:
            return Promise.all(cmd.cmds.map(cmd2 => cmdRunner(taskRunner, cmd2)))
                .then(flattenDeepArrays);
    }
}

const enhance = (originalCreateStore: StoreCreator) => {
    return <S>(taskRunner: TaskRunner, reducer: EnhancedReducer<S>, initialState: S, enhancer?: StoreEnhancer<S>) => {
        // This subject represents a stream of cmds coming from
        // the reducer
        const subject = createSubject<Cmd<any, any, Action>>();
        const liftedReducer = liftReducer(reducer, subject.onNext)
        const store = originalCreateStore(liftedReducer, initialState, enhancer)
        // Close the loop by running the command and dispatching to the
        // store
        subject
            .map(cmd => cmdRunner(taskRunner, cmd))
            .subscribe(msgPromise => (
                msgPromise.then(msg => {
                    if (Array.isArray(msg)) {
                        msg.forEach(store.dispatch)
                    } else {
                        store.dispatch(msg)
                    }
                })
            ))

        return store;
    }
}
export default enhance;

// http://package.elm-lang.org/packages/evancz/elm-http/latest/Http#get
export const httpGet = <Value>(decoder: (x: any) => Value, url: string, fetchOptions?: RequestInit): FetchTask<Value, Error> => (
    {
        type: 'fetch',
        url,
        fetchOptions,
        decoder
    }
);

export const performTask = <X, A, Msg>(
    onFail: (x: X) => Msg,
    onSuccess: (a: A) => Msg,
    task: FetchTask<X, A>
): Cmd<X, A, Msg> => ({
    type: CmdTypes.Single, onFail, onSuccess, task
})

type Dictionary<T> = { [index: string]: T; }
// https://github.com/redux-loop/redux-loop/blob/c708d98a9960d9efe3accc3acbc8f86c940941fa/modules/combineReducers.js
export const combineReducers = <S>(reducerMap: EnhancedReducersMapObject): EnhancedReducer<S> => {
    return <Msg>(state: Dictionary<any>, msg: Msg): [S, Option<Cmd<any, any, Msg>>] => {
        type Accumulator = {
            state: any,
            commands: Option<Cmd<any, any, Msg>>[]
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
