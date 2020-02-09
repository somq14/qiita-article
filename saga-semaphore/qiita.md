## はじめに
[redux-saga](https://redux-saga.js.org/) で排他制御がやりたくて,
[await-semaphore](https://www.npmjs.com/package/await-semaphore)を使ったらうまくいきました.

サンプルは [こちら](https://github.com/somq14/qiita-article/tree/master/saga-semaphore) にアップロードしています.
何かの参考になれば幸いです.

## やりたいこと

やりたいことは, **複数のsagaがstore上のデータを同時並行に取り合う処理**です.
より具体的には, 次のようなことがやりたいです.

- storeにデータのリストがある `['a', 'b', 'c']`
- 2つのsagaが同時並行で以下をやる
  - storeからリストを取得する
  - リストから最初のデータを選択する
  - 取り出したデータをstoreから削除する

**sagaが同じデータを取り出してしまったらNGです.**
2個のsagaが順に実行されればOKなのですが,
sagaは並行に実行されるので, NGになるかもしれません.

### 排他制御が必要になるケース

例えば, 以下のケースでNGになります.

- saga1: リストを取得 `['a', 'b', 'c']`
- saga2: リストを取得 `['a', 'b', 'c']`
- saga1: `'a'`を選択
- saga1: リストから`'a'`を削除 `['b', 'c']`
- saga2: `'a'`を選択 (saga1によるリストの更新に気が付かず`'a'`を選択してしまう!)
- saga2: リストから`'a'`を削除 `['b', 'c']` (`'a'`はすでにsaga1により削除されている!)

saga1, saga2どちらも`'a'`を取得してしまいました...

### セマフォを使う
NGの原因は, saga1, saga2 が同時並行で実行されることです.
**saga1が実行を終えるまで, saga2を待たせることができれば, うまくいきそうです.**
本記事では, [await-semaphore](https://www.npmjs.com/package/await-semaphore) の セマフォを使ってこの排他制御を実現します.

## 排他制御なしでやる

### コード
```js:reducer.js
const initialState = {
  // このデータを複数のsagaが取り合う
  items: ["a", "b", "c"],
}

export default function reducer(state = initialState, action) {
  switch (action.type) {
    // 指定されたデータをstoreから削除
    case "REMOVE": {
      const { item } = action
      return {
        items: state.items.filter(x => x !== item),
      }
    }
    default:
      return state
  }
}
```

```js:saga.js
import { fork, select, put, join } from "redux-saga/effects"

function* popItem() {
  // リストを取得
  const items = yield select(state => state.items)
  if (items.length <= 0) {
    throw new Error("insufficient items")
  }

  // リストから先頭のデータを選択
  const item = items[0]

  // 選択したデータをリストから削除
  yield put({ type: "REMOVE", item })

  // 呼び出し元に選択したデータを返す
  return item
}

export default function* mainSaga() {
  // 3個のsagaを起動
  const tasks = [yield fork(popItem), yield fork(popItem), yield fork(popItem)]

  // sagaの終了を待つ
  yield join(tasks)

  // 各sagaが取得したデータを表示
  console.info(
    "fetched items =",
    tasks.map(x => x.result())
  )
}
```

### 実行結果
実行すると, 3個のsagaすべてが `'a'` を取得してしまいます...

```zsh

% yarn start
yarn run v1.21.1
$ babel-node src/main.js
store changed = { items: [ 'b', 'c' ] }
store changed = { items: [ 'b', 'c' ] }
store changed = { items: [ 'b', 'c' ] }
fetched items = [ 'a', 'a', 'a' ] # すべてのsagaが 'a' を取得してしまった!
Done in 0.55s.
```

## 排他制御を加える
排他制御なしのコードにセマフォの記述を加えるだけです.

### コード
```js:sagaWithLock.js
import { call, fork, select, put, join } from "redux-saga/effects"
import { Semaphore } from "await-semaphore"

// セマフォ作成
// 引数が 1 ならば同時にロックを獲得できる saga は1つ
// 引数 1 を指定するなら, new Mutex() と等価
const sem = new Semaphore(1)

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
  const release = yield call([sem, sem.acquire])
  try {
    // このブロックを実行できるsagaは高々1個
    const items = yield select(state => state.items)
    if (items.length <= 0) {
      throw new Error("insufficient items")
    }
    const item = items[0]
    yield put({ type: "REMOVE", item })
    return item
  } finally {
    // 忘れずにロックを解放する
    release()
  }
}

export default function* mainSagaWithLock() {
  const tasks = [
    yield fork(popItemWithLock),
    yield fork(popItemWithLock),
    yield fork(popItemWithLock),
  ]
  yield join(tasks)

  console.info(
    "fetched items =",
    tasks.map(x => x.result())
  )
}
```

### 実行結果
3個のsagaがそれぞれ`'a', 'b', 'c'`を取得できました!

```zsh
% yarn start --enable-lock # オプションをつけると mainSagaWithLock が起動する
yarn run v1.21.1
$ babel-node src/main.js --enable-lock
store changed = { items: [ 'b', 'c' ] } # 'a' が取り出される
store changed = { items: [ 'c' ] }      # 'b' が取り出される
store changed = { items: [] }           # 'c' が取り出される
fetched items = [ 'a', 'b', 'c' ] # 相異なるデータを取得できた
Done in 0.53s.
```

## さいごに
ありがとうございました.

