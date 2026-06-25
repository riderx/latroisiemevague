/// <reference types="astro/client" />

declare module "*.html?raw" {
  const content: string
  export default content
}
