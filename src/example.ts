import {Option,Some,None} from 'monapt';
import {combineReducers, install, Cmd, performTask, httpGet} from './enhancer';
import {createStore} from 'redux';

// createStore(reducer, install())
const enhancedCreateStore = install<State>()(createStore);

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

enum ActionTypes { Fetch, FetchSuccess, FetchError, Test };
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
type Action = FetchAction | FetchSuccessAction | FetchErrorAction | { type: ActionTypes.Test };

const decodeGifUrl = (response: any): string => response.data.image_url;
const getRandomGif = (topic: string): Cmd<FetchSuccessAction | FetchErrorAction> => {
    const url = "https://api.giphy.com/v1/gifs/random?api_key=dc6zaTOxFJmzC&tag=" + topic;
    return performTask(
        createFetchSuccessAction,
        createFetchErrorAction,
        httpGet(decodeGifUrl, url)
    )
}

type MainState = {
    status: 'not started' | 'pending' | 'success' | 'error',
    result: Option<Result<string>>
}
type State = {
    main: MainState
};
const reducer = (state: MainState, action: Action): [MainState, Option<Cmd<Action>>] => {
    switch (action.type) {
        case ActionTypes.Fetch:
            return [{ status: 'pending', result: None }, new Some(getRandomGif('food'))];
        case ActionTypes.FetchSuccess:
            return [{ status: 'success', result: new Some(action.result) }, new Some(
                Cmd.batch([Cmd.batch([() => Promise.resolve({ type: ActionTypes.Test })])])
            )]
        case ActionTypes.FetchError:
            return [{ status: 'error', result: new Some(action.result) }, None]
        // withDefault
        case ActionTypes.Test:
            console.log('it worked')
            return [state, None]
        default:
            return [state, None];
    }
}

const initialState: State = {
    main: {
        status: 'not started',
        result: None
    }
};

const store = enhancedCreateStore(combineReducers({ main: reducer }), initialState);

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
    .map(result => result.success ? JSON.stringify(result.value, null, '\t') : result.reason)
    .getOrElse(() => '')}
</pre>`;
});

store.dispatch({ type: ActionTypes.Fetch });
