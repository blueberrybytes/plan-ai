declare namespace NodeJS {
  interface ProcessEnv {
    REACT_APP_API_BACKEND_URL: string;
    REACT_APP_ENV: string;
  }
}

declare module "*.svg" {
  const content: string;
  export default content;
}
