import enhance, { composeReducers, TaskRunner, EnhancedReducerResult } from "./redux-reducer-effects";
import { assert } from "chai";
import { createStore } from "redux";
import { Subject, Observable } from "@reactivex/rxjs";

type Action = { type : string};
type Task = { task: string };
type State = {
    counter: number,
};

describe("redux-reducer-effects", function() {

    describe("enhance store", function() {

        it("can create", function() {


            const enhancerStack = enhance({
                createSubject: () => new Subject<Task>(),
                taskRunner,
                scheduler: (fn) => setTimeout(fn)
            });

            const store = createStore<State>(<any>reducer, { counter: 0 }, enhancerStack);

            store.dispatch({ type: "asyncInc" });

            return wait(5)
              .then(() => {
                  assert.deepEqual(store.getState(), { counter: 1 });
              })

            function reducer(state: State, action: Action): EnhancedReducerResult<State,Task> {
                switch(action.type) {
                    case "asyncInc":
                        return [state, { task: "asyncInc" }];

                    case "increment":
                        return { counter: state.counter + 1 };

                    default:
                        return state;
                }
            }

            function taskRunner(task: Task): Observable<Action> {
              return Observable.from([{ type: "increment" }]);
            }


        })
        
    })

    describe("compose reducers", function() {

        it("keeps all state changes", function() {
            const combined = composeReducers(increment, increment, increment);

            const [state] = <any>(combined({ counter: 0 }, { type: "init" }));
            assert(state, "expected final state");
            assert.equal(state.counter, 3);

            function increment(s: State, action: Action) {
                return {
                    counter: s.counter + 1,
                }
            }
        })

        it("combines tasks, from both states with and without new tasks", function() {
            const combined = composeReducers(increment, incrementWithTask, increment, incrementWithTask);
            const stubTask = () => ({ task: "do thing" });

            const [state, tasks] = <any>combined({ counter: 0 }, { type: "init" });

            assert(state, "expected final state");
            assert.equal(state.counter, 4);
            assert.deepEqual(tasks, [stubTask(), stubTask()]);

            function increment(s: State, action: Action) {
                return {
                    counter: s.counter + 1,
                }
            }

            function incrementWithTask(s: State, action: Action): EnhancedReducerResult<State, Task> {
                return [{
                    counter: s.counter + 1,
                }, stubTask()]
            }
        })


    })

    describe("combine reducers", function() {


    })
})


function wait(n: number) {
  return new Promise(resolve => setTimeout(resolve, n));
}
