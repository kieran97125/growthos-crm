import {createHash,createHmac} from "node:crypto";
export function invitationToken(key:Uint8Array,company:string,command:string) {
  if(key.byteLength!==32) throw Error("invitation_key_invalid");
  return createHmac("sha256",key).update(JSON.stringify(["convelta-invitation-v1",company,command])).digest("base64url");
}
export function invitationHash(token:string) {return createHash("sha256").update(token).digest("hex");}
