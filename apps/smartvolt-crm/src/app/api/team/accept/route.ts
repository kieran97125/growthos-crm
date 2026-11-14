import type {NextRequest} from "next/server";
import {failure,json,sameOrigin} from "@/lib/saas/http";
import {boundedJson} from "@/lib/whatsapp/http";
import {acceptTeam} from "@/lib/team/server";
export async function POST(request:NextRequest){try{sameOrigin(request);return json(await acceptTeam(await boundedJson(request)));}catch(e){return failure(e);}}
