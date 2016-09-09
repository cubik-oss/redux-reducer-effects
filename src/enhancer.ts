import {flatten as flattenOptions, Some, Option} from 'monapt';
import {StoreEnhancer, StoreCreator, Reducer, Action} from 'redux';
import {flatten as flattenArrays} from 'lodash';

type EnhancedReducer<State, Task> = <Msg>(state: State, msg: Msg) => [State, Option<Task[]>];
type EnhancedReducersMapObject<Task> = {
    [key: string]: EnhancedReducer<any, Task>;
}

const liftReducer = <Msg, S, Task>(reducer: EnhancedReducer<S, Task>, callback: (task: Task) => void): Reducer<S> => {
    return (state: S, msg: Msg) => {
        const [newState, maybeTasks] = reducer(state, msg);
        maybeTasks.foreach(tasks => tasks.forEach(callback))
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

export type TaskRunner<Msg> = <Task>(task: Task) => Promise<Msg>;

const enhance = (originalCreateStore: StoreCreator) => {
    return <S, Task, Msg extends Action>(taskRunner: TaskRunner<Msg>, reducer: EnhancedReducer<S, Task>, initialState: S, enhancer?: StoreEnhancer<S>) => {
        // This subject represents a stream of cmds coming from
        // the reducer
        const subject = createSubject<Task>();
        const liftedReducer = liftReducer(reducer, subject.onNext)
        const store = originalCreateStore(liftedReducer, initialState, enhancer)
        // Close the loop by running the command and dispatching to the
        // store
        subject
            .map(taskRunner)
            .subscribe(msgPromise => (
                msgPromise.then(msg => {
                    store.dispatch(msg)
                })
            ))

        return store;
    }
}
export default enhance;

type Dictionary<T> = { [index: string]: T; }
export const combineReducers = <S, Task>(reducerMap: EnhancedReducersMapObject<Task>): EnhancedReducer<S, Task> => {
    return <Msg>(state: Dictionary<any>, msg: Msg): [S, Option<Task[]>] => {
        type Accumulator = {
            state: any,
            tasks: Option<Task[]>[]
            hasChanged: boolean
        };
        const model = Object.keys(reducerMap).reduce<Accumulator>((acc, key) => {
            const reducer = reducerMap[key];
            // We lose type safety here because state is a record
            const previousStateForKey = state[key];
            const nextResultForKey = reducer(previousStateForKey, msg);
            const [nextStateForKey, maybeTasks] = nextResultForKey;

            acc.hasChanged = acc.hasChanged || nextStateForKey !== previousStateForKey;
            acc.state[key] = nextStateForKey;
            acc.tasks.push(maybeTasks);
            return acc;
        }, {
            state: {},
            tasks: [],
            hasChanged: false
        });

        const tasks: Task[] = flattenArrays(flattenOptions(model.tasks));
        return [model.state, new Some(tasks)];
    };
}
