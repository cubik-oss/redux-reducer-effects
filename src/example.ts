import {Option,Some,None} from 'monapt';
import enhance, {combineReducers, Cmd, performTask, httpGet, TaskRunner, Task, TaskResult, createTaskSuccess, createTaskError} from './enhancer';
import {createStore} from 'redux';

// createStore(reducer, install())
const enhancedCreateStore = enhance(createStore);

const create = <T>(t: T): T => t;

export type Success<A> = { success: true; value: A; }
export type Error<X> = { success: false; value: X }

type Result<X, A> = Error<X> | Success<A>;

enum ActionTypes { Fetch, FetchSuccess, FetchError, Test, RunConstant, RunConstantDone };
type RunConstantDoneAction = { type: ActionTypes.RunConstantDone };
const createRunConstantDoneAction = (): RunConstantDoneAction => (
    { type: ActionTypes.RunConstantDone }
)
type FetchAction = { type: ActionTypes.Fetch };
type FetchSuccessAction = { type: ActionTypes.FetchSuccess, result: Result<string, string> };
const createFetchSuccessAction = (result: string): FetchSuccessAction => ({
    type: ActionTypes.FetchSuccess,
    result: create<Success<string>>({ success: true, value: result })
});
type FetchErrorAction = { type: ActionTypes.FetchError, result: Result<string, string> };
const createFetchErrorAction = (result: string): FetchErrorAction => ({
    type: ActionTypes.FetchError,
    result: create<Error<string>>({ success: false, value: result })
});
type FetchResponseAction = FetchSuccessAction | FetchErrorAction;
type Action = FetchAction | FetchResponseAction | { type: ActionTypes.Test } | { type: ActionTypes.RunConstant } | RunConstantDoneAction;

const decodeGifUrl = (response: any): string => response.data.image_url;

const getRandomGif = (topic: string): Cmd<string, string, FetchResponseAction> => {
    const url = "https://api.giphy.com/v1/gifs/random?api_key=dc6zaTOxFJmzC&tag=" + topic;
    // Msg generic can't be inferred, unlike Elm?
    return performTask<string, string, FetchResponseAction>(
        createFetchErrorAction,
        createFetchSuccessAction,
        httpGet(decodeGifUrl, url)
    )
}

type MainState = {
    status: 'not started' | 'pending' | 'success' | 'error',
    result: Option<Result<string, string>>,
    constantRan: boolean
}
type State = {
    main: MainState
};
const patch = <O, P>(o: O, p: P): O & P => Object.assign({}, o, p);
const reducer = (state: MainState, action: Action): [MainState, Option<Cmd<any, any, Action>>] => {
    switch (action.type) {
        case ActionTypes.Fetch:
            return [patch(state, { status: 'pending', result: None }), new Some(getRandomGif('food'))];
        case ActionTypes.FetchSuccess:
            return [patch(state, { status: 'success', result: new Some(action.result) }), None]
        case ActionTypes.FetchError:
            return [patch(state, { status: 'error', result: new Some(action.result) }), None]

        case ActionTypes.RunConstant:
            return [state, new Some(Cmd.constant(createRunConstantDoneAction()))]
        case ActionTypes.RunConstantDone:
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

const myTaskRunner: TaskRunner = <X, A>(task: Task<X, A>): Promise<TaskResult<X, A>> => {
    if (task.type === 'fetch') {
        return fetch(task.url, task.fetchOptions)
            .then(response => response.json())
            .then(task.decoder)
            .then(createTaskSuccess)
            .catch(createTaskError)
    } else {
        throw new Error('Missing handler');
    }
}

const store = enhancedCreateStore(myTaskRunner, combineReducers<State>({ main: reducer }), initialState);

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
    store.dispatch({ type: ActionTypes.RunConstant });
}, 1000)
