
import { Vec2 } from '@cocos/box2d';
import { Texture2D } from '../../../asset/assets/texture-2d';
import { TextureBase } from '../../../asset/assets/texture-base';
import { Size, cclegacy, size, v2 } from '../../../core';
import { Atlas } from '../dynamic-atlas/atlas';
import { SpriteFrame } from '../../assets/sprite-frame';

const space = 2;

export interface AtlasInfo{
    x:number,
    y:number,
    texture:Texture2D,
}

export default class AtlasPro extends Atlas{

    //图集中所有的贴图
    textures:Texture2D[] = [];
    //贴图坐标信息
    textureInfos:{[uuid:string]:AtlasInfo} = {};
    
    //记录读取过信息的SpriteFrame
    frames:SpriteFrame[] = [];

    static Index:number = 0;

    uuid:string;
    
    constructor (width, height) {
        super(width, height)
        this.uuid = this._texture.getId();
    }


    getTexture(){
        return this._texture;
    }

    //获取信息
    getInfo(frame:SpriteFrame,texture:TextureBase){
        let info = this.textureInfos[texture.uuid];
        if(info){
            this.frames.push(frame);
        }
        return info;
    }

    /**
     * 添加贴图进入图集
     */
    insertTexture(texture:Texture2D){
        let info = this.textureInfos[texture.uuid]

        if(!info){

            //如果没有则添加贴图到图集
            const width = texture.width;
            const height = texture.height;

            if ((this._x + width + space) > this._width) {
                this._x = space;
                this._y = this._nexty;
            }

            if ((this._y + height + space) > this._nexty) {
                this._nexty = this._y + height + space;
            }

            if (this._nexty > this._height) {
                return null;
            }

            // Smaller frame is more likely to be affected by linear filter
            if (width <= 8 || height <= 8) {
                this._texture.drawTextureAt(texture.image!, this._x - 1, this._y - 1);
                this._texture.drawTextureAt(texture.image!, this._x - 1, this._y + 1);
                this._texture.drawTextureAt(texture.image!, this._x + 1, this._y - 1);
                this._texture.drawTextureAt(texture.image!, this._x + 1, this._y + 1);
            }

            this._texture.drawTextureAt(texture.image!, this._x - 1, this._y);
            this._texture.drawTextureAt(texture.image!, this._x + 1, this._y);
            this._texture.drawTextureAt(texture.image!, this._x, this._y - 1);
            this._texture.drawTextureAt(texture.image!, this._x, this._y + 1);

            this._texture.drawTextureAt(texture.image!, this._x, this._y);

            info = {
                x: this._x,
                y: this._y,
                texture: this._texture,
            };

            this._count++;
            this._x += width + space;
            this.textureInfos[texture.uuid] = info
            this.textures.push(texture);
        }

        return info;

    }

    /**
     * 传入贴图计算刚刚好的大小
     */
    static compute(textures:TextureBase[]){

        let x = space;
        let y = space;

        for (let index = 0; index < textures.length; index++) {
            let texture = textures[index];
            y = Math.max(y,texture.height + space + space)
            x += (texture.width + space);
        }

        return v2(x,y);

    }
    
}

