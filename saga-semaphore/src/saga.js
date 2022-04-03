import { fork, select, put, join } from "redux-saga/effects";

function* popItem() {
  // リストを取得
  const items = yield select((state) => state.items);
  if (items.length <= 0) {
    throw new Error("insufficient items");
  }

  // リストから先頭のデータを選択
  const item = items[0];

  // 選択したデータをリストから削除
  yield put({ type: "REMOVE", item });

  // 呼び出し元に選択したデータを返す
  return item;
}

export default function* mainSaga() {
  // 3個のsagaを起動
  const tasks = [yield fork(popItem), yield fork(popItem), yield fork(popItem)];

  // sagaの終了を待つ
  yield join(tasks);

  // 各sagaが取得したデータを表示
  console.info(
    "fetched items =",
    tasks.map((x) => x.result())
  );
}
