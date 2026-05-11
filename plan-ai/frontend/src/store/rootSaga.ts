import { all, fork } from "redux-saga/effects";
import { sessionSaga } from "./sagas/sessionSaga";

export default function* rootSaga() {
  yield all([fork(sessionSaga)]);
}
