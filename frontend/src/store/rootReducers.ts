/* eslint-disable @typescript-eslint/no-explicit-any */
import { combineReducers } from "@reduxjs/toolkit";
import authReducer from "./slices/auth/authSlice";
import appReducer from "./slices/app/appSlice";
import chatHomeReducer from "./slices/chatHome/chatHomeSlice";
import { resetStore } from "./actions";
import { authApi } from "./apis/authApi";
import { projectApi } from "./apis/projectApi";
import { accountApi } from "./apis/accountApi";
import { contextApi } from "./apis/contextApi";
import { jiraApi } from "./apis/jiraApi";
import { integrationApi } from "./apis/integrationApi";
import { chatApi } from "./apis/chatApi";
import { slideApi } from "./apis/slideApi";
import { transcriptApi } from "./apis/transcriptApi";
import { docApi } from "./apis/docApi";
import { docThemeApi } from "./apis/docThemeApi";

// Define the combined reducers
const appReducers = combineReducers({
  app: appReducer,
  auth: authReducer,
  chatHome: chatHomeReducer,
  [authApi.reducerPath]: authApi.reducer,
  [projectApi.reducerPath]: projectApi.reducer,
  [accountApi.reducerPath]: accountApi.reducer,
  [contextApi.reducerPath]: contextApi.reducer,
  [jiraApi.reducerPath]: jiraApi.reducer,
  [integrationApi.reducerPath]: integrationApi.reducer,
  [chatApi.reducerPath]: chatApi.reducer,
  [slideApi.reducerPath]: slideApi.reducer,
  [transcriptApi.reducerPath]: transcriptApi.reducer,
  [docApi.reducerPath]: docApi.reducer,
  [docThemeApi.reducerPath]: docThemeApi.reducer,
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
