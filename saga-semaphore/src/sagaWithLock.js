import { call, fork, select, put, join } from "redux-saga/effects";
import { Semaphore } from "await-semaphore";

// セマフォ作成
// 引数が 1 ならば同時にロックを獲得できる saga は1つ
// 引数 1 を指定するなら, new Mutex() と等価
const sem = new Semaphore(1);

function* popItemWithLock() {
  // sem.acquire を呼び出して, ロックの獲得をする
  // もし, 他の saga がロックを獲得していれば, その saga が release() を呼び出すまで待つ
  // 他の saga がロックを獲得していなければ, すぐにロックを獲得できる
  //
  // call([sem, sem.acquire]) は sem.acquire() の呼び出しを意味する
  // https://redux-saga.js.org/docs/api/#callcontext-fn-args
  //
  // sem.acquire() は Promise を返すため, yield call でロックの獲得を待つ
  // https://www.npmjs.com/package/await-semaphore#semaphoreacquire-promise--void
  const release = yield call([sem, sem.acquire]);
  try {
    // このブロックを実行できるsagaは高々1個
    const items = yield select((state) => state.items);
    if (items.length <= 0) {
      throw new Error("insufficient items");
    }
    const item = items[0];
    yield put({ type: "REMOVE", item });
    return item;
  } finally {
    // 忘れずにロックを解放する
    release();
  }
}

export default function* mainSagaWithLock() {
  const tasks = [
    yield fork(popItemWithLock),
    yield fork(popItemWithLock),
    yield fork(popItemWithLock),
  ];
  yield join(tasks);

  console.info(
    "fetched items =",
    tasks.map((x) => x.result())
  );
}
