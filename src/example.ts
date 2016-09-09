import {Option,Some,None} from 'monapt';
import enhance, {combineReducers, TaskRunner} from './enhancer';
import {createStore} from 'redux';

// createStore(reducer, enhance)
const enhancedCreateStore = enhance(createStore);

const create = <T>(t: T): T => t;

export type Success<A> = { success: true; value: A; }
export type Error<X> = { success: false; value: X }

type Result<X, A> = Error<X> | Success<A>;

enum ActionTypes { Fetch, FetchSuccess, FetchError, Test, RunTask, RunTaskDone };
type RunTaskDoneAction = { type: ActionTypes.RunTaskDone };
const createRunTaskDoneAction = (): RunTaskDoneAction => (
    { type: ActionTypes.RunTaskDone }
)
type FetchAction = { type: ActionTypes.Fetch };
type FetchSuccessAction = { type: ActionTypes.FetchSuccess, result: Result<string, string> };
const createFetchSuccessAction = (result: Success<string>): FetchSuccessAction => ({
    type: ActionTypes.FetchSuccess,
    result
});
type FetchErrorAction = { type: ActionTypes.FetchError, result: Result<string, string> };
const createFetchErrorAction = (result: Error<string>): FetchErrorAction => ({
    type: ActionTypes.FetchError,
    result
});
type FetchResponseAction = FetchSuccessAction | FetchErrorAction;
type Action = FetchAction | FetchResponseAction | { type: ActionTypes.Test } | { type: ActionTypes.RunTask } | RunTaskDoneAction;

type TaskError<X> = { success: false, value: X }
type TaskSuccess<A> = { success: true, value: A }

export const createTaskError = <X>(x: X): TaskError<X> => ({ success: false, value: x })
export const createTaskSuccess = <A>(a: A): TaskSuccess<A> => ({ success: true, value: a })

enum TaskTypes { GetRandomGif, RunTask }
type GetRandomGifTask = {
    type: TaskTypes.GetRandomGif,
    topic: string,
    onFail: (x: TaskError<string>) => FetchErrorAction,
    onSuccess: (a: TaskSuccess<string>) => FetchSuccessAction,
}
type RunTaskTask = { type: TaskTypes.RunTask }
type Task = GetRandomGifTask | RunTaskTask

type MainState = {
    status: 'not started' | 'pending' | 'success' | 'error',
    result: Option<Result<string, string>>,
    constantRan: boolean
}
type State = {
    main: MainState
};
const patch = <O, P>(o: O, p: P): O & P => Object.assign({}, o, p);
const reducer = (state: MainState, action: Action): [MainState, Option<Task[]>] => {
    switch (action.type) {
        case ActionTypes.Fetch:
            return [patch(state, { status: 'pending', result: None }), new Some([
                create<GetRandomGifTask>({
                    type: TaskTypes.GetRandomGif,
                    topic: 'food',
                    onFail: createFetchErrorAction,
                    onSuccess: createFetchSuccessAction,
                })
            ])];
        case ActionTypes.FetchSuccess:
            return [patch(state, { status: 'success', result: new Some(action.result) }), None]
        case ActionTypes.FetchError:
            return [patch(state, { status: 'error', result: new Some(action.result) }), None]

        case ActionTypes.RunTask:
            return [state, new Some([
                create<RunTaskTask>({ type: TaskTypes.RunTask })
            ])]
        case ActionTypes.RunTaskDone:
            return [patch(state, { constantRan: true }), None]
        default:
            return [state, None];
    }
}

const initialState: State = {
    main: {
        status: 'not started',
        result: None,
        constantRan: false,
    }
};

enum EffectTypes { Fetch }
type FetchEffect<Value> = {
    type: EffectTypes.Fetch,
    url: string,
    fetchOptions?: RequestInit,
    decoder: (x: any) => Value
}

const createGifUrl = (topic: string): string => `https://api.giphy.com/v1/gifs/random?api_key=dc6zaTOxFJmzC&tag=${topic}`;
const decodeGifUrl = (response: any): string => response.data.image_url;
const myTaskRunner: TaskRunner<Action> = <X, A>(task: Task): Promise<Action> => {
    switch (task.type) {
        case TaskTypes.GetRandomGif:
            const url = createGifUrl(task.topic);
            return fetch(url)
                .then(response => response.json())
                .then(decodeGifUrl)
                .then(createTaskSuccess)
                .catch(createTaskError)
                .then(result => (
                    result.success
                        ? task.onSuccess(result)
                        : task.onFail(result)
                ))
        case TaskTypes.RunTask:
            return Promise.resolve(createRunTaskDoneAction())
    }
}

const store = enhancedCreateStore(myTaskRunner, combineReducers<State, Task>({ main: reducer }), initialState);

const rootEl = document.getElementById('root');
store.subscribe(() => {
    const state = store.getState();
    if (rootEl) rootEl.innerHTML = `
<pre>
Status: ${state.main.status}
Result success: ${state.main.result
    .map(result => result.success)
    .getOrElse(() => false)}
Result success value/failure reason: ${state.main.result
    .map(result => result.success ? JSON.stringify(result.value, null, '\t') : result.value)
    .getOrElse(() => '')}
Constant ran: ${state.main.constantRan}
</pre>`;
});

store.dispatch({ type: ActionTypes.Fetch });
setTimeout(() => {
    store.dispatch({ type: ActionTypes.RunTask });
}, 1000)
