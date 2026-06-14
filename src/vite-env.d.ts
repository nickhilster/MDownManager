/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

declare module "*.html?raw" {
  const content: string;
  export default content;
}
