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
const performTask = <Success, Error>(success: Action, error: Action, task: Task<Success, Error>): Cmd<Action> => {
    return () => task().then(() => success, () => error)
}

const httpGet = (url: string): Task<string, string> => {
    return () => (
        fetch(url).then(response => {
            if (response.ok) {
                return response.json();
            } else {
                return 'bad response';
            }
        })
    )
}

// End lib

const getRandomGif = <Action>(topic: string): Cmd<Action> => {
    const url = "https://api.giphy.com/v1/gifs/random?api_key=dc6zaTOxFJmzC&tag=" + topic;
    return performTask(
        { type: ActionTypes.FetchSuccess },
        { type: ActionTypes.FetchError },
        httpGet(url)
    )
}

type State = 'not started' | 'pending' | 'success' | 'error';
enum ActionTypes { Fetch, FetchSuccess, FetchError };
type Action = { type: ActionTypes.Fetch } | { type: ActionTypes.FetchSuccess } | { type: ActionTypes.FetchError }
const reducer: ReducerFn<Action, State> = (action: Action, state: State): [State, Option<Cmd<Action>>] => {
    switch (action.type) {
        case ActionTypes.Fetch:
            return ['pending', new Some(getRandomGif('food'))];
        case ActionTypes.FetchSuccess:
            return ['success', None]
        case ActionTypes.FetchError:
            return ['error', None]
        default:
            return [state, None];
    }
}

const initialState: State = 'not started';
const store = createStore(reducer, initialState);

const rootEl = document.getElementById('root');
store.subscribe(() => { if (rootEl) rootEl.innerHTML = store.getState() });

store.dispatch({ type: ActionTypes.Fetch });
