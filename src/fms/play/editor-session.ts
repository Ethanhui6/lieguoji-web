import { PlaySession, type PlayCommand } from './session';
import { customizeRun, type CustomizeCommand } from './customization';
import type { FmsRun } from './world';

export type EditorCommand=PlayCommand|CustomizeCommand;
export class EditorSession {
  private session=new PlaySession();
  private current?:FmsRun;
  execute(command:EditorCommand){
    if(command.type==='customize'){
      if(!this.current)throw Error('请先创建或读取世界。');
      const candidate=customizeRun(this.current,command);
      const result=this.session.execute({type:'load',run:candidate});
      this.current=result.run;return result;
    }
    const result=this.session.execute(command);this.current=result.run??this.current;return result;
  }
}
