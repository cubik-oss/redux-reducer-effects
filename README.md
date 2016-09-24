# redux-reducer-effects

Redux enhancer which adds support for **managed effects** to the reducer.

## Reducer
* **Pure** function as before, returning state *and tasks*
* **Task**: description of a side effect, to be ran by the *task runner*

`(state: State, action: Action) => [State, Task]`

## Task runner
* **Impure** function to perform all side effects for incoming *tasks*
* Input: an Observable of *tasks*
* Output: an Observable of *actions* for the enhancer to dispatch

`(tasks$: Observable<Task>) => Observable<Action>`

## Example

[See an example of what this looks like in practice](./src/example.ts).

## Inspiration

[redux-observable](https://github.com/redux-observable/redux-observable) allows you to interpret incoming actions as a stream (Observable), performing side effects when the stream emits a new value and returning a stream of new actions to be dispatched (see [“Epics”](https://github.com/redux-observable/redux-observable/blob/master/docs/basics/Epics.md)). The Observable interface makes it easy to manage complex asynchronous tasks without maintaining lots of internal state (e.g. debounce, cancellation).

In Elm, it is easy to reason about when and which new actions will be dispatched as a result of any asynchronous work by simply looking inside the reducer (also known as `update`) function, which returns a tuple of the next state and side effects to be ran (returned as data). In redux-observable, epics are provided to the store at initialisation along with the reducer, making it much harder to trace where and when asynchronous actions will be dispatched.

Last but not least, we wanted the ability to easily write declarative tests for all our business logic: when an action occurs, *what should happen now (state)* and *what should happen next (tasks)*.

This is why we decided all business logic should have a single source of truth: the reducer.

Also:

* [The Elm Architecture](https://github.com/evancz/elm-architecture-tutorial)
* [Effects as Data by Richard Feldman](https://www.youtube.com/watch?v=6EdXaWfoslc)
* [redux-loop](https://github.com/redux-loop/redux-loop)

## Usage

TODO: Improve example using ping/pong

``` js
import {createEnhancer} from './enhancer';
import {createStore} from 'redux';

const enhancer = createEnhancer({
    createSubject: () => new Subject(),
    taskRunner,
})
const store = createStore(reducer, initialState, enhancer);
```

## Development

```
npm install
npm run compile
# run local HTTP server against ./target dir, e.g. http-server CLI `http-server -c-1 ./target`
npm test
```
