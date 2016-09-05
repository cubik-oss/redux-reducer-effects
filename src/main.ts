import {Option, Some, None} from 'monapt';

type Cmd<Action> = () => Promise<Action>;
type ReducerFn<Action, State> = (action: Action, newState: State) => [State, Option<Cmd<Action>>];
type SubscriberFn = () => void;
type DispatchFn<Action> = (action: Action) => void;
type GetStateFn<State> = () => State;
type SubscribeFn = (fn: SubscriberFn) => void;
type Store<Action, State> = { subscribe: SubscribeFn, getState: GetStateFn<State>, dispatch: DispatchFn<Action> }

const createStore = <Action, State>(reducer: ReducerFn<Action, State>, initialState: State): Store<Action, State> => {
    const subscribers: SubscriberFn[] = [];
    const subscribe: SubscribeFn = (fn: SubscriberFn) => { subscribers.push(fn) };
    let state: State = initialState;

    // https://github.com/Microsoft/TypeScript/issues/9757
    // const dispatch: DispatchFn<Action> = (action: Action) => {
    function dispatch(action: Action) {
        const result = reducer(action, state);
        [ state ] = result;
        const [ , maybeCommand ] = result;
        subscribers.forEach(fn => fn());
        maybeCommand.foreach(command => command().then(dispatch))
    }

    const getState: GetStateFn<State> = () => state;
    return { subscribe, getState, dispatch };
}


type Task<Success, Error> = () => Promise<Success | Error>
type CreateActionFn<Msg, Action> = (msg: Msg) => Action;
const performTask = <SuccessAction, ErrorAction, Success, Error>(
    createSuccessAction: CreateActionFn<Success, SuccessAction>,
    createErrorAction: CreateActionFn<Error, ErrorAction>,
    task: Task<Success, Error>): Cmd<Action> => {
    return () => task().then(createSuccessAction, createErrorAction)
}

const httpGet = (url: string): Task<string, string> => (
    () => (
        fetch(url)
            .then(response => (
                response.ok
                    ? response.json().then(json => JSON.stringify(json, null, '\t'))
                    : Promise.resolve('bad response')
            ))
    )
);

// End lib

const create = <T>(t: T): T => t;

export interface Success<T> {
    success: true;
    value: T;
}

export interface Failure {
    success: false;
    reason: string;
}

type Result<T> = Success<T> | Failure;

enum ActionTypes { Fetch, FetchSuccess, FetchError };
type FetchAction = { type: ActionTypes.Fetch };
type FetchSuccessAction = { type: ActionTypes.FetchSuccess, result: Result<string> };
const createFetchSuccessAction = (result: string): FetchSuccessAction => ({
    type: ActionTypes.FetchSuccess,
    result: create<Success<string>>({ success: true, value: result })
});
type FetchErrorAction = { type: ActionTypes.FetchError, result: Result<string> };
const createFetchErrorAction = (result: string): FetchErrorAction => ({
    type: ActionTypes.FetchError,
    result: create<Failure>({ success: false, reason: result })
});
type Action = FetchAction | FetchSuccessAction | FetchErrorAction;

const getRandomGif = <Action>(topic: string): Cmd<Action> => {
    const url = "https://api.giphy.com/v1/gifs/random?api_key=dc6zaTOxFJmzC&tag=" + topic;
    return performTask(createFetchSuccessAction, createFetchErrorAction, httpGet(url))
}

type State = {
    status: 'not started' | 'pending' | 'success' | 'error',
    result: Option<Result<string>>
};
const reducer: ReducerFn<Action, State> = (action: Action, state: State): [State, Option<Cmd<Action>>] => {
    switch (action.type) {
        case ActionTypes.Fetch:
            return [{ status: 'pending', result: None }, new Some(getRandomGif('food'))];
        case ActionTypes.FetchSuccess:
            return [{ status: 'success', result: new Some(action.result) }, None]
        case ActionTypes.FetchError:
            return [{ status: 'error', result: new Some(action.result) }, None]
    }
}

const initialState: State = {
    status: 'not started',
    result: None
};
const store = createStore(reducer, initialState);

const rootEl = document.getElementById('root');
store.subscribe(() => {
    const state = store.getState();
    if (rootEl) rootEl.innerHTML = `
<pre>
Status: ${state.status}
Result success: ${state.result
    .map(result => result.success)
    .getOrElse(() => false)}
Result success value/failure reason: ${state.result
    .map(result => result.success ? result.value : result.reason)
    .getOrElse(() => '')}
</pre>`;
});

store.dispatch({ type: ActionTypes.Fetch });
