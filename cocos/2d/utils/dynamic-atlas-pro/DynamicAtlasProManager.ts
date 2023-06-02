import { TextureBase } from '../../../asset/assets/texture-base';
import { System, size } from '../../../core';
import { director } from '../../../game';
import { SpriteFrame } from '../../assets';
import { UIRenderer } from '../../framework';
import { BaseRenderData } from '../../renderer/render-data';
import { Node } from '../../../scene-graph';
import { Material, Texture2D } from '../../../asset/assets';
import { builtinResMgr } from '../../../asset/asset-manager';
import { Texture } from '../../../gfx';
import { Label } from '../../components';
import AtlasPro from './AtlasPro';
import { array } from '../../../core/utils/js';

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
    isAllBatch:boolean = false;
}

/**
 * 动态合图Pro 是一个高优化的合图策略 弥补 之前合图的大部分缺点
 */
export class DynamicAtlasProManager extends System{

    public static instance: DynamicAtlasProManager;

    //目前只有ui-sprite-material才可以合批
    material:Material = builtinResMgr.get(`ui-sprite-material`);

    //当前帧渲染合批顺序
    commits:DynamicAtlasCommit[] = [new DynamicAtlasCommit()];

    //所有贴图
    textures:{[id:string]:Texture2D} = {};

    //贴图关系{贴图Id:合图Id数组}
    atlaseTexts:{[id:string]:string[]} = {};

    //所有合图{合图Id:合图}
    atlases:{[id:string]:AtlasPro} = {};

    //提交渲染顺序
    commit(render: UIRenderer, renderData: BaseRenderData|null, frame: SpriteFrame, assembler: any, transform: Node | null){

        //如果不是ui-sprite-material材质 则不可以合批
        if(render.customMaterial != this.material){
            this.block();
            return;
        }

        let texture = frame.texture;
        let uuid = texture.uuid;
        if(uuid == "" && render instanceof Label){
            //如果是Label 则 主动赋值一个UUID
            uuid = texture._uuid = render.string + "_" + render.color + "_" + frame.rect + "_" + render.fontSize + render.fontFamily;
        }

        this.commits[this.commits.length - 1].commits.push({
            render,
            frame,
            material:render.customMaterial,
        });
        this.commits[this.commits.length - 1].uuids.push(frame.texture.uuid);
        this.textures[frame.texture.uuid] = frame.texture as Texture2D;
        if(frame.original){
            this.commits[this.commits.length - 1].isAllBatch = true;
        }
    }

    //添加一个打断记录
    block(){
        this.commits.push(new DynamicAtlasCommit());
    }

    postUpdate(dt: number): void {
        console.log(this.commits,this.textures);
        this.optimize();
        this.commits = [new DynamicAtlasCommit()];
        this.textures = {};
    }

    //根据当前的合批顺序 优化动态合批
    optimize(){

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
        }else{
            atlas = this.createAtlas(info);
        }

        this.relatedAtlas(atlas,info);

    }

    //根据DynamicAtlasCommit 创建合图
    createAtlas(info:DynamicAtlasCommit){
        let textures = this.getTextures(...info.uuids);
        let size = AtlasPro.compute(textures);
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
        console.log("relatedAtlas",this.atlases);

        for (let index = 0; index < info.commits.length; index++) {
            const commit = info.commits[index];
            let atlasInfo = atlas.textureInfos[commit.frame!.texture.uuid]
            if(atlasInfo){
                let rx = commit.frame!.rect.x;
                let ry = commit.frame!.rect.y;
                console.log(commit.frame!.rect);
                commit.frame?._setDynamicAtlasFrame({
                    x:rx+atlasInfo.x,
                    y:ry+atlasInfo.y,
                    texture:atlasInfo.texture
                });
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
