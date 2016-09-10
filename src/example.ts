import {Option,Some,None} from 'monapt';
import enhance, {combineReducers, TaskRunner} from './enhancer';
import {createStore} from 'redux';

const enhancedCreateStore = enhance(createStore);

const create = <T>(t: T): T => t;

export type Success<A> = { success: true; value: A; }
export type Error<X> = { success: false; value: X }
type Result<X, A> = Error<X> | Success<A>;

enum ActionTypes { Fetch, FetchSuccess, FetchError };
type FetchAction = { type: ActionTypes.Fetch };
type FetchSuccessAction = { type: ActionTypes.FetchSuccess, result: Success<string> };
const createFetchSuccessAction = (result: Success<string>): FetchSuccessAction => ({
    type: ActionTypes.FetchSuccess,
    result
});
type FetchErrorAction = { type: ActionTypes.FetchError, result: Error<string> };
const createFetchErrorAction = (result: Error<string>): FetchErrorAction => ({
    type: ActionTypes.FetchError,
    result
});
type Action = FetchAction | FetchSuccessAction | FetchErrorAction;

type TaskError<X> = { success: false, value: X }
type TaskSuccess<A> = { success: true, value: A }

export const createError = <X>(x: X): Error<X> => ({ success: false, value: x })
export const createSuccess = <A>(a: A): Success<A> => ({ success: true, value: a })

type GetRandomGifTask = {
    type: 'GetRandomGif',
    topic: string,
    onFail: (x: TaskError<string>) => FetchErrorAction,
    onSuccess: (a: TaskSuccess<string>) => FetchSuccessAction,
}
type Task = GetRandomGifTask;

type MainState = {
    status: 'not started' | 'pending' | 'success' | 'error',
    result: Option<Result<string, string>>
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
                    type: 'GetRandomGif',
                    topic: 'food',
                    onFail: createFetchErrorAction,
                    onSuccess: createFetchSuccessAction,
                })
            ])];
        case ActionTypes.FetchSuccess:
            return [patch(state, { status: 'success', result: new Some(action.result) }), None]
        case ActionTypes.FetchError:
            return [patch(state, { status: 'error', result: new Some(action.result) }), None]
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

const createGifUrl = (topic: string): string => `https://api.giphy.com/v1/gifs/random?api_key=dc6zaTOxFJmzC&tag=${topic}`;
const decodeGifUrl = (response: any): string => response.data.image_url;
// Callbacks must be on Task because otherwise we don't know their type
// Is result of Task compaitable with callback? We only know this if
// they are coupled
const myTaskRunner: TaskRunner<Action> = <X, A>(task: Task): Promise<Action> => {
    switch (task.type) {
        case 'GetRandomGif':
            const url = createGifUrl(task.topic);
            return fetch(url)
                .then(response => response.json())
                .then(decodeGifUrl)
                .then(createSuccess)
                .catch(createError)
                .then(result => (
                    result.success
                        ? task.onSuccess(result)
                        : task.onFail(result)
                ))
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
</pre>`;
});

store.dispatch({ type: ActionTypes.Fetch });
