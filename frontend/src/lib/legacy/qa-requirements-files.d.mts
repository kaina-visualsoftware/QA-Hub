export const ATTACHMENT_LIMIT: number;
export const EXTRACTION_LIMIT: number;
export const ATTACHMENT_TYPES: Record<string,string>;
export const FILE_BUCKET: string;
export function validateRequirementFile(file:{name:string;size:number;type?:string},bytes?:Uint8Array):{extension:string;mime:string;size:number};
export function extensionForFile(name:string):string;
export function storagePathForFile(userId:string,taskId:string,uuid:string,extension:string):string;
export function sha256Hex(bytes:Uint8Array):Promise<string>;
