# redux-reducer-effects

Redux enhancer which allows you to define effects as `Cmd`s, [like in Elm](http://guide.elm-lang.org/architecture/effects/).

Reducer signature:
* before: `(state: State, action: Action): State`
* after: `(state: State, action: Action): [State, Option<Cmd<Action>>]`

## Usage

``` ts
import {install} from './enhancer';
import {createStore} from 'redux';

const enhancedCreateStore = install<Action, State>()(createStore);
const store = enhancedCreateStore(reducer, initialState);
```

## Development

```
npm install
npm run compile
# run local HTTP server against ./target dir, e.g. http-server CLI `http-server -c-1 ./target`
```

## Prior art
* [redux-loop](https://github.com/redux-loop/redux-loop): great project. I'm keen to integrate with this, although it's API is quite far behind Elm's latest, and it's not currently type safe. https://github.com/redux-loop/redux-loop/issues/87
* [The Elm Architecture](https://github.com/evancz/elm-architecture-tutorial)
