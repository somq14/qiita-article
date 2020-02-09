import program from "commander"

import store, { sagaMiddleware } from "./store"
import mainSaga from "./saga"
import mainSagaWithLock from "./sagaWithLock"

program.option("--enable-lock")
program.parse(process.argv)

store.subscribe(() => console.info("store changed =", store.getState()))

if (program.enableLock) {
  sagaMiddleware.run(mainSagaWithLock)
} else {
  sagaMiddleware.run(mainSaga)
}
