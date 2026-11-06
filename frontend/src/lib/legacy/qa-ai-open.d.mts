import type { LocalDraft } from "./qa-assistant.mjs";
export const OPEN_MODEL: Readonly<{id:string; library:string; maxInput:number}>;
export function parseOpenModelJson(output: unknown): LocalDraft;
export function mergeOpenModelDraft(text:string,output:unknown):LocalDraft;
export type LocalModelClient = {
  extract(text:string,onProgress?:(message:string)=>void):Promise<LocalDraft>;
  dispose():void;
};
export function createOpenModelClient(workerFactory?:()=>Worker):LocalModelClient;
export function extractWithOpenModel(text:string,onProgress?:(message:string)=>void):Promise<LocalDraft>;
