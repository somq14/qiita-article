const initialState = {
  // このデータを複数のsagaが取り合う
  items: ["a", "b", "c"],
};

export default function reducer(state = initialState, action) {
  switch (action.type) {
    // 指定されたデータをstoreから削除
    case "REMOVE": {
      const { item } = action;
      return {
        items: state.items.filter((x) => x !== item),
      };
    }
    default:
      return state;
  }
}
