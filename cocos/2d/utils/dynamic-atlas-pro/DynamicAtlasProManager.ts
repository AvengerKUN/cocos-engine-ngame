import { TextureBase } from '../../../asset/assets/texture-base';
import { System, size } from '../../../core';
import { director } from '../../../game';
import { BitmapFont, SpriteFrame } from '../../assets';
import { UIRenderer } from '../../framework';
import { BaseRenderData } from '../../renderer/render-data';
import { Node } from '../../../scene-graph';
import { Material, Texture2D } from '../../../asset/assets';
import { builtinResMgr } from '../../../asset/asset-manager';
import { Texture } from '../../../gfx';
import { Label, Sprite } from '../../components';
import AtlasPro from './AtlasPro';
import { array } from '../../../core/utils/js';
import { EDITOR } from 'internal:constants';
import { WebGLDeviceManager } from '../../../gfx/webgl/webgl-define';

//提交记录
interface AtlasCommit{
    render?:UIRenderer;
    frame?:SpriteFrame;
    material?:Material | null;
}
class DynamicAtlasCommit{
    uuids:string[] = [];
    commits:AtlasCommit[] = [];
    //是否都合批
    isAllBatch:boolean = true;
}

/**
 * 动态合图Pro 是一个高优化的合图策略 弥补 之前合图的大部分缺点
 */
export class DynamicAtlasProManager extends System{

    public static instance: DynamicAtlasProManager;

    //当前帧渲染合批顺序
    commits:DynamicAtlasCommit[] = [new DynamicAtlasCommit()];

    //所有贴图
    textures:{[id:string]:Texture2D} = {};

    //贴图关系{贴图Id:合图Id数组}
    atlaseTexts:{[id:string]:string[]} = {};

    //所有合图{合图Id:合图}
    atlases:{[id:string]:AtlasPro} = {};

    //记入需要删除的Atlas
    deletes:string[] = [];

    //是否开启DynamicAtlasProManager
    enabled:boolean = false;

    //是否清理
    _isClear:boolean = false;

    //是否优化
    _isOptimize:boolean = false;

    //多出数量
    excess:number = 2;

    //强行渲染
    isForce:boolean = false;

    //提交渲染顺序
    commit(render: UIRenderer, renderData: BaseRenderData|null, frame: SpriteFrame, assembler: any, transform: Node | null){
        if(!this.enabled || EDITOR) return;

        //如果不是ui-sprite-material材质 则不可以合批
        if(render.customMaterial || render.getSharedMaterial(0) != builtinResMgr.get(`ui-sprite-material`)){
            this.block();
            return;
        }

        //如果是艺术字打断
        if(render instanceof Label){
            if(render.font instanceof BitmapFont){
                if(!render.spriteFrame){
                    // this.block();
                    return;
                }
                // if(!render.original){
                //     if(render._setDynamicAtlasFrame()){
                //         frame = render.spriteFrame as SpriteFrame;
                //         // commit.render.markForUpdateRenderData();
                //     }else{
                //         this.block();
                //         return;
                //     }
                // }
            }
        }

        if(render instanceof Sprite){
            if(!render.spriteFrame){
                // this.block();
                return;
            }
            if(!render.original){
                render._setDynamicAtlasFrame();
                frame = render.spriteFrame;
            }
        }

        let texture = frame.original?._texture || frame.texture;

        this.commits[this.commits.length - 1].commits.push({
            render,
            frame,
            material:render.customMaterial,
        });
        this.commits[this.commits.length - 1].uuids.push(texture.uuid);
        this.textures[texture.uuid] = texture as Texture2D;
        if(!frame.original || this.isForce){
            this.commits[this.commits.length - 1].isAllBatch = false;
        }
        array.fastRemove(this.deletes,frame.texture.getId())
    }

    //添加一个打断记录
    block(){
        this.commits.push(new DynamicAtlasCommit());
    }

    update(dt: number): void {
        if(!this.enabled) return;
        this._isClear && this._clear();
        this._isOptimize && this._optimize();
        this.commits = [new DynamicAtlasCommit()];
        this.textures = {};
        this.deletes = Object.keys(this.atlases);
        this._isClear = false;
        this._isOptimize = false;
    }

    public clear(){
        this._isClear = true;
    }

    public optimize(){
        this._isOptimize = true;
    }

    //清除不需要的Atlas
    _clear(){

        for (let index = 0; index < this.deletes.length; index++) {
            const atlasKey = this.deletes[index];
            // console.log("清理",atlasKey);
            let atlas = this.atlases[atlasKey];
            //重置用过atlas的SpriteFrame
            for (let index = 0; index < atlas.frames.length; index++) {
                const frame = atlas.frames[index];
                if(frame.texture && frame.texture.getId() === atlasKey){
                    frame._resetDynamicAtlasFrame();
                }
            }
            atlas.destroy();
            delete this.atlases[atlasKey];
            //解除关系
            let relations = Object.values(this.atlaseTexts)
            for (let index = 0; index < relations.length; index++) {
                const relation = relations[index];
                array.fastRemove(relation,atlasKey);
            }
        }

    }

    //根据当前的合批顺序 优化动态合批
    _optimize(){

        // console.log(this.commits,this.textures,this.atlases);

        for (let index = 0; index < this.commits.length; index++) {

            const info = this.commits[index];
            const commits = this.commits[index].commits;
            if(info.isAllBatch) continue;
            if(commits.length === 0) continue;

            //进行合图
            this.dynamicAtlas(info);

        }

    }

    //合图
    dynamicAtlas(info:DynamicAtlasCommit){
        
        //如果没有合批则合批
        //获取之前有的合同
        let atlases = this.getAtlas(info.uuids);
        let atlas:AtlasPro | null;
        //如果之前有则使用之前的 如果 没有 则创建一个新的
        if(atlases.length){
            //找到最小的图
            let index = array.getMinIndex(atlases.map(key => {
                let atlas = this.atlases[key];
                return atlas.width * atlas.height
            }))
            atlas = this.atlases[atlases[index]];
            if(atlas.textures.length > info.uuids.length + this.excess){
                //如果多的太多则重新创建
                atlas = this.createAtlas(info);
            }
        }else{
            atlas = this.createAtlas(info);
        }

        this.relatedAtlas(atlas,info);

    }

    //根据DynamicAtlasCommit 创建合图
    createAtlas(info:DynamicAtlasCommit){
        let textures = this.getTextures(...info.uuids);
        let size = AtlasPro.compute(textures);

        const maxSize = Math.max(size.x,size.y);
        if(WebGLDeviceManager.instance.capabilities.maxTextureSize <= maxSize){
            //超过合图大小
            //将大图过滤
            textures = AtlasPro.adaption(textures) as Texture2D[];
            size = AtlasPro.compute(textures);
        }

        let atlas = new AtlasPro(size.x,size.y);
        
        //合图
        textures.forEach(texture => {
            atlas.insertTexture(texture);
            //建立关系方便快速查找
            let tAtlas = this.atlaseTexts[texture.uuid];
            if(tAtlas){
                tAtlas.push(atlas.uuid);
            }else{
                this.atlaseTexts[texture.uuid] = [atlas.uuid];
            }
        })
        this.atlases[atlas.uuid] = atlas;
        return atlas;
    }

    //关联
    relatedAtlas(atlas:AtlasPro,info:DynamicAtlasCommit){

        // //将所有UIRanderer关联合图
        // info.commits.forEach(commit => {
        //     commit.render
        // })
        // console.log("relatedAtlas",this.atlases);

        for (let index = 0; index < info.commits.length; index++) {
            const commit = info.commits[index];
            let atlasInfo;
            let isDynamic = false;

            // if((commit.render as any)._setDynamicAtlasFrame && !((commit.render as any).original)){
            //     (commit.render as any)._setDynamicAtlasFrame();
            // }

            if(!(commit.frame?.original)){

                atlasInfo = atlas.getInfo(commit.frame as SpriteFrame,commit.frame!.texture)

                if(atlasInfo){
                    let rx = commit.frame!.rect.x;
                    let ry = commit.frame!.rect.y;
    
                    commit.frame?._setDynamicAtlasFrame({
                        x:rx+atlasInfo.x,
                        y:ry+atlasInfo.y,
                        texture:atlasInfo.texture
                    });
    
                    isDynamic = true;
                }

            }else{

                atlasInfo = atlas.getInfo(commit.frame as SpriteFrame,commit.frame!.original._texture)

                if(atlasInfo){
                    if((commit.frame.texture) != atlas.getTexture()){
    
                        commit.frame?._resetDynamicAtlasFrame();
    
                        let rx = commit.frame!.rect.x;
                        let ry = commit.frame!.rect.y;
                        commit.frame?._setDynamicAtlasFrame({
                            x:rx+atlasInfo.x,
                            y:ry+atlasInfo.y,
                            texture:atlasInfo.texture
                        });
                        isDynamic = true;
    
                    }
                }

            }

            // if(commit.render instanceof Label){
            //     if(commit.render.font instanceof BitmapFont){
            //         continue;
            //     }
            // }

            if(isDynamic){
                commit.render!.renderData?.updateTextureHash(commit.frame as SpriteFrame);
                commit.render!.renderData?.updateHashValue();
                (commit.render as any)._assembler.updateUVs(commit.render);

                if(commit.render instanceof Sprite){
                    commit.render.renderData!.vertDirty = true;
                    if((commit.render as any)._assembler.updateFillRenderData){
                        (commit.render as any)._assembler.updateFillRenderData(commit.render.renderData,commit.render);
                    }
                    // commit.render.markForUpdateRenderData();
                }
                if(commit.render instanceof Label){
                    if(commit.render.font instanceof BitmapFont){
                        if (commit.render.renderData) {
                            commit.render.renderData.vertDirty = true;
                        };
                        if((commit.render as any)._assembler.updateRenderData){
                            (commit.render as any)._assembler.updateRenderData(commit.render);
                        }
                    }
                    // commit.render.markForUpdateRenderData();
                }
            }

        }

    }

    //根据UUID获取贴图
    getTextures(...uuids:string[]){
        
        let textures:Texture2D[] = [];
        (new Set(uuids)).forEach(uuid => {textures.push(this.textures[uuid])})
        return textures;
        
    }

    //获取包含贴图的合图
    getAtlas(ids:string[]){

        let atlasKeys:string[][] = [];

        for (let index = 0; index < ids.length; index++) {
            const key = ids[index];
            let value = this.atlaseTexts[key];
            if(value){
                atlasKeys.push(value);
                continue;
            }
            return [];
        }

        //都包含的值
        let atlas = array.queryContains(...atlasKeys);
        return atlas;


    }

}

export const dynamicAtlaProManager: DynamicAtlasProManager = DynamicAtlasProManager.instance = new DynamicAtlasProManager();
director.registerSystem('dynamicAtlaProManager', dynamicAtlaProManager, 0);
