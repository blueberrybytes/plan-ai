/* eslint-disable @typescript-eslint/no-explicit-any */
import { combineReducers } from "@reduxjs/toolkit";
import sessionReducer from "./slices/session/sessionSlice";
import appReducer from "./slices/app/appSlice";
import { resetStore } from "./actions";
import { sessionApi } from "./apis/sessionApi";
import { accountApi } from "./apis/accountApi";
import { contextApi } from "./apis/contextApi";
import { jiraApi } from "./apis/jiraApi";
import { integrationApi } from "./apis/integrationApi";
import { chatApi } from "./apis/chatApi";
import { slideApi } from "./apis/slideApi";

// Define the combined reducers
const appReducers = combineReducers({
  app: appReducer,
  session: sessionReducer,
  [sessionApi.reducerPath]: sessionApi.reducer,
  [accountApi.reducerPath]: accountApi.reducer,
  [contextApi.reducerPath]: contextApi.reducer,
  [jiraApi.reducerPath]: jiraApi.reducer,
  [integrationApi.reducerPath]: integrationApi.reducer,
  [chatApi.reducerPath]: chatApi.reducer,
  [slideApi.reducerPath]: slideApi.reducer,
});

// Create a root reducer that can handle the reset action
const rootReducers = (state: any, action: any) => {
  // When the reset action is dispatched, return undefined state
  // which will cause each reducer to return its initial state
  if (action.type === resetStore.type) {
    // Clear the state but keep some non-sensitive data if needed
    state = undefined;
  }

  // Pass the state and action to the combined reducers
  return appReducers(state, action);
};

export default rootReducers;
