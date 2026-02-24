/* eslint-disable @typescript-eslint/no-explicit-any */
import { configureStore, Tuple } from "@reduxjs/toolkit";
import createSagaMiddleware from "redux-saga";
import { persistStore, persistReducer, createMigrate } from "redux-persist";
import storage from "redux-persist/lib/storage"; // Defaults to localStorage for web
import rootSaga from "./rootSaga";
import rootReducer from "./rootReducers";
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

const migrations = {
  1: (state: any) => {
    console.debug("Executing migration 1");
    return {
      ...state,
    };
  },
};

const persistConfig = {
  key: "root",
  storage,
  blacklist: [],
  version: 1,
  migrate: createMigrate(migrations, { debug: false }),
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

// Create the saga middleware
const sagaMiddleware = createSagaMiddleware();

// Configure the store
const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    new Tuple(
      ...getDefaultMiddleware({
        serializableCheck: {
          ignoredActions: ["persist/PERSIST", "persist/REHYDRATE"],
        },
      }),
      sagaMiddleware,
      authApi.middleware,
      projectApi.middleware,
      accountApi.middleware,
      contextApi.middleware,
      jiraApi.middleware,
      integrationApi.middleware,
      chatApi.middleware,
      slideApi.middleware,
      transcriptApi.middleware,
      docApi.middleware,
      docThemeApi.middleware,
    ),
});

// Run the root saga
sagaMiddleware.run(rootSaga);
// Configure persistor
export const persistor = persistStore(store);

export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = typeof store.dispatch;
export default store;
