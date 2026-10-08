import {PlayClient as CurrentClient} from './war46-client';
import type {GameCommand} from './war46-session';
type Result=Awaited<ReturnType<CurrentClient['send']>>;
type Client={send(command:GameCommand):Promise<Result>;close(message?:string):void};
const factories={18:()=>import('./naming18-client'),19:()=>import('./restoration19-client'),20:()=>import('./destiny20-client'),21:()=>import('./muster21-client'),22:()=>import('./life22-client'),23:()=>import('./dynasty23-client'),24:()=>import('./voyage24-client'),25:()=>import('./settlement25-client'),26:()=>import('./war26-client'),27:()=>import('./war27-client')};
/** Frozen worlds run in their own original Worker/client, avoiding repeated
 * clone and validation through dozens of newer version adapters on every load.
 * Each Worker still performs its full original validation and stamp checks. */
export class LegacyClientRouter {
 private client:Client|null=null;private version=46;private closed=false;
 async send(command:GameCommand):Promise<Result>{
  if(this.closed)throw Error('模拟线程已关闭。');
  const version=command.type==='load'&&command.run.version in factories?command.run.version:command.type==='load'||command.type==='create'||command.type==='copy'?46:this.version;
  if(!this.client||version!==this.version){
   this.client?.close();this.client=null;
   if(version in factories){
    const module=await factories[version as keyof typeof factories]();if(this.closed)throw Error('模拟线程已关闭。');
    // UI commands are version-gated; the selected original Worker is the final
    // runtime validator. We do not rewrite commands, snapshots or fingerprints.
    this.client=new module.PlayClient() as Client;
   }else this.client=new CurrentClient();
   this.version=version;
  }
  return this.client.send(command);
 }
 close(message?:string){this.closed=true;this.client?.close(message);this.client=null;}
}
