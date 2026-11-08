export type LineChange = readonly [" " | "+" | "-", string];
export interface TextDiff { changes: LineChange[]; added: number; removed: number; changed: number }
export interface XmlDiff { lines: string[]; total: number; added: number; removed: number; changed: number }
export function compareTextLines(first:string,second:string):TextDiff;
export function compareXmlDocuments(first:string,second:string,ignoreSpacing?:boolean):XmlDiff;
export function organizeRelease(input:{version:string;raw:string;team?:string;defaultStatus?:"11"|"12"}):{text:string;warnings:string[];numbers:string[]};
export function reviewRelease(input:{raw:string;announcement:string;version?:string;compat?:string;signature?:string}):{report:string;cleaned:string;removed:string;bbcode:string};
