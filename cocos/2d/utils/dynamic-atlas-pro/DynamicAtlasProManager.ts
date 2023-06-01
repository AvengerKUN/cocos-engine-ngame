import { TextureBase } from '../../../asset/assets/texture-base';
import { System } from '../../../core';
import { director } from '../../../game';
import { SpriteFrame } from '../../assets';
import { UIRenderer } from '../../framework';
import { BaseRenderData } from '../../renderer/render-data';
import { Node } from '../../../scene-graph';
import { Material } from '../../../asset/assets';
import { builtinResMgr } from '../../../asset/asset-manager';
import { Texture } from '../../../gfx';
import { Label } from '../../components';
import { Atlas } from '../dynamic-atlas/atlas';

//提交记录
interface DynamicAtlasCommit{
    render?:UIRenderer;
    frame?:SpriteFrame;
    material?:Material | null;
}

/**
 * 动态合图Pro 是一个高优化的合图策略 弥补 之前合图的大部分缺点
 */

export class DynamicAtlasProManager extends System{

    public static instance: DynamicAtlasProManager;

    //目前只有ui-sprite-material才可以合批
    material:Material = builtinResMgr.get(`ui-sprite-material`);

    //当前帧渲染合批顺序
    commits:DynamicAtlasCommit[][] = [[]];

    //所有贴图
    textures:{[id:string]:TextureBase}[] = [];

    //贴图关系
    atlaseTexts:{[id:string]:string[]} = {};

    //所有合图
    atlases:{[id:string]:Atlas} = {};

    //提交渲染顺序
    commit(render: UIRenderer, renderData: BaseRenderData|null, frame: SpriteFrame, assembler: any, transform: Node | null){

        //如果不是ui-sprite-material材质 则不可以合批
        if(render.customMaterial != this.material){
            this.block();
            return;
        }

        this.commits[this.commits.length - 1].push({
            render,
            frame,
            material:render.customMaterial,
        });
        let texture = frame.texture;
        let uuid = texture.uuid;
        if(uuid == "" && render instanceof Label){
            //如果是Label 则 主动赋值一个UUID
            texture._uuid = render.string + "_" + render.color + "_" + frame.rect + "_" + render.fontSize + render.fontFamily;
        }
        this.textures[this.textures.length - 1][frame.texture.uuid] = frame.texture;

    }

    //添加一个打断记录
    block(){
        this.commits.push([]);
        this.textures.push({});
    }

    postUpdate(dt: number): void {
        console.log(this.commits,this.textures);
        this.commits = [[]];
        this.textures = [{}];
    }

    //根据当前的合批顺序 优化动态合批
    optimize(){



    }

    //获取包含贴图的合图
    getAtlas(ids:string[]){

        let atlasKeys:string[][] = [];

        for (let index = 0; index < ids.length; index++) {
            const key = ids[index];
            atlasKeys.push(this.atlaseTexts[key]);
        }

        //都包含的值
        let atlas


    }

}

export const dynamicAtlaProManager: DynamicAtlasProManager = DynamicAtlasProManager.instance = new DynamicAtlasProManager();
director.registerSystem('dynamicAtlaProManager', dynamicAtlaProManager, 0);
