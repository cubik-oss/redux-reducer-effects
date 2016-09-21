import { composeReducers, EnhancedReducerResult } from "./redux-reducer-effects";
import { assert } from "chai";

type Action = { type : string};
type Task = { task: string };
type State = {
    counter: number,
};

describe("redux-reducer-effects", function() {

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

