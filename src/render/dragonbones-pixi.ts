import {
	Armature,
	BaseFactory,
	BaseObject,
	DragonBones,
	Slot,
	TextureAtlasData,
	TextureData,
} from "pixi-dragonbones-runtime"
import {
	BLEND_MODES,
	Container,
	groupD8,
	Rectangle,
	SimpleMesh,
	Sprite,
	Texture,
} from "pixi.js"

/**
 * A self-contained DragonBones→Pixi rendering backend.
 *
 * `pixi-dragonbones-runtime@7.0.0` ships its own Pixi layer but its
 * `_buildTextureAtlasData` never assigns the atlas renderTexture, so every
 * sub-texture stays null and `buildArmatureDisplay` throws. Rather than
 * depend on that broken published layer, this module builds the display
 * objects directly on top of the DragonBones **core** classes the package
 * re-exports (`BaseFactory`, `Slot`, `Armature`, `TextureAtlasData`…), and
 * wires the atlas texture correctly:
 *
 *  - `DragonBonesTextureAtlasData` builds a Pixi `Texture` per sub-texture.
 *  - The factory assigns `renderTexture` **after** sub-textures are parsed
 *    (so the setter actually populates them), fixing the 7.0.0 ordering bug.
 */

/** A Pixi texture-atlas data: holds the atlas page texture per sub-texture. */
class DragonBonesTextureAtlasData extends TextureAtlasData {
	static override toString(): string {
		return "[class dragonBones.PluginTextureAtlasData]"
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private _renderTexture: any = null

	renderTexture: any = null

	createTexture(): TextureData {
		return BaseObject.borrowObject(DragonBonesTextureData)
	}

	get renderTextureValue(): any {
		return this._renderTexture
	}

	set renderTextureValue(value: any) {
		this._renderTexture = value
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		for (const k of Object.keys((this as any).textures ?? {})) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const textureData = (this as any).textures[k]
			const region = textureData.region
			textureData.renderTexture =
				this._renderTexture === null
					? null
					: new Texture(
							this._renderTexture,
							new Rectangle(region.x, region.y, region.width, region.height),
							new Rectangle(region.x, region.y, region.width, region.height),
							new Rectangle(0, 0, region.width, region.height),
							textureData.rotated ? groupD8.S : 0,
						)
		}
	}
}

/** One sub-texture with its own Pixi `Texture`. */
class DragonBonesTextureData extends TextureData {
	static override toString(): string {
		return "[class dragonBones.PluginTextureData]"
	}

	renderTexture: Texture | null = null
}

/** A Pixi `Container` that proxies a DragonBones armature. */
export class DragonBonesArmatureDisplay extends Container {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	_armature: any = null

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	dbInit(armature: any): void {
		this._armature = armature
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	dbClear(): void {
		this._armature = null
		super.destroy()
	}

	dbUpdate(): void {
		// No debug draw in this build.
	}

	dispose(_disposeProxy = true): void {
		if (this._armature !== null) {
			this._armature.dispose()
			this._armature = null
		}
	}

	override destroy(): void {
		this.dispose()
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	dispatchDBEvent(type: string, eventObject: any): void {
		this.emit(type, eventObject)
	}

	hasDBEventListener(type: string): boolean {
		return this.listenerCount(type) > 0
	}

	addDBEventListener(type: string, listener: (...args: unknown[]) => void, target: unknown): void {
		this.addListener(type, listener, target)
	}

	removeDBEventListener(type: string, listener: (...args: unknown[]) => void, target: unknown): void {
		this.removeListener(type, listener, target)
	}

	get armature(): any {
		return this._armature
	}

	get animation(): any {
		return this._armature?.animation
	}
}

/** A DragonBones slot that renders its display as a Pixi sprite/mesh. */
class DragonBonesSlot extends Slot {
	static override toString(): string {
		return "[class dragonBones.PluginSlot]"
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	_renderDisplay: any = null
	_textureScale = 1.0

	protected override _onClear(): void {
		super._onClear()
		this._textureScale = 1.0
		this._renderDisplay = null
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	protected override _initDisplay(_value: any, _isRetain: boolean): void {}

	protected override _disposeDisplay(value: any, isRelease: boolean): void {
		if (!isRelease) value.destroy()
	}

	protected override _onUpdateDisplay(): void {
		this._renderDisplay = this._display ? this._display : this._rawDisplay
	}

	protected override _addDisplay(): void {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		;(this._armature as any).display.addChild(this._renderDisplay)
	}

	protected override _replaceDisplay(value: any): void {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const container = (this._armature as any).display
		container.addChild(this._renderDisplay)
		container.swapChildren(this._renderDisplay, value)
		container.removeChild(value)
		this._textureScale = 1.0
	}

	protected override _removeDisplay(): void {
		this._renderDisplay.parent.removeChild(this._renderDisplay)
	}

	protected override _updateZOrder(): void {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const container = (this._armature as any).display
		const index = container.getChildIndex(this._renderDisplay)
		if (index === (this as any)._zOrder) return
		container.addChildAt(this._renderDisplay, (this as any)._zOrder)
	}

	override _updateVisible(): void {
		this._renderDisplay.visible = (this as any)._parent.visible && (this as any)._visible
	}

	protected override _updateBlendMode(): void {
		if (this._renderDisplay instanceof Sprite) {
			const blend = (this as any)._blendMode
			const modes: Record<number, number> = {
				0: BLEND_MODES.NORMAL,
				1: BLEND_MODES.ADD,
				3: BLEND_MODES.DARKEN,
				4: BLEND_MODES.DIFFERENCE,
				6: BLEND_MODES.HARD_LIGHT,
				9: BLEND_MODES.LIGHTEN,
				10: BLEND_MODES.MULTIPLY,
				11: BLEND_MODES.OVERLAY,
				12: BLEND_MODES.SCREEN,
			}
			if (modes[blend] !== undefined) this._renderDisplay.blendMode = modes[blend]
		}
	}

	protected override _updateColor(): void {
		const alpha = (this as any)._colorTransform.alphaMultiplier * (this as any)._globalAlpha
		this._renderDisplay.alpha = alpha
		if (this._renderDisplay instanceof Sprite || this._renderDisplay instanceof SimpleMesh) {
			const color =
				(Math.round((this as any)._colorTransform.redMultiplier * 0xff) << 16) +
				(Math.round((this as any)._colorTransform.greenMultiplier * 0xff) << 8) +
				Math.round((this as any)._colorTransform.blueMultiplier * 0xff)
			this._renderDisplay.tint = color
		}
	}

	protected override _updateFrame(): void {
		let currentTextureData = (this as any)._textureData
		if (
			(this as any)._displayIndex >= 0 &&
			(this as any)._display !== null &&
			currentTextureData !== null
		) {
			const renderTexture = currentTextureData.renderTexture
			if (renderTexture !== null) {
				if ((this as any)._geometryData !== null) {
					// Mesh display.
					const data = (this as any)._geometryData.data
					const intArray = data.intArray
					const floatArray = data.floatArray
					const vertexCount = intArray[(this as any)._geometryData.offset + 0]
					const triangleCount = intArray[(this as any)._geometryData.offset + 1]
					let vertexOffset = intArray[(this as any)._geometryData.offset + 2]
					if (vertexOffset < 0) vertexOffset += 65536
					const uvOffset = vertexOffset + vertexCount * 2
					const scale = (this as any)._armature._armatureData.scale
					const meshDisplay = this._renderDisplay
					const vertices = new Float32Array(vertexCount * 2)
					const uvs = new Float32Array(vertexCount * 2)
					const indices = new Uint16Array(triangleCount * 3)
					for (let i = 0, l = vertexCount * 2; i < l; ++i) {
						vertices[i] = floatArray[vertexOffset + i] * scale
					}
					for (let i = 0; i < triangleCount * 3; ++i) {
						indices[i] = intArray[(this as any)._geometryData.offset + 4 + i]
					}
					for (let i = 0, l = vertexCount * 2; i < l; i += 2) {
						const u = floatArray[uvOffset + i]
						const v = floatArray[uvOffset + i + 1]
						if (currentTextureData.rotated) {
							uvs[i] = 1 - v
							uvs[i + 1] = u
						} else {
							uvs[i] = u
							uvs[i + 1] = v
						}
					}
					this._textureScale = 1.0
					meshDisplay.texture = renderTexture
					meshDisplay.vertices = vertices
					meshDisplay.uvBuffer.update(uvs)
					meshDisplay.geometry.getIndex().update(indices)
					const isSkinned = (this as any)._geometryData.weight !== null
					const isSurface = (this as any)._parent._boneData.type !== 0
					if (isSkinned || isSurface) this._identityTransform()
				} else {
					this._textureScale =
						currentTextureData.parent.scale * (this as any)._armature._armatureData.scale
					this._renderDisplay.texture = renderTexture
				}
				;(this as any)._visibleDirty = true
				return
			}
		}
		if ((this as any)._geometryData !== null) {
			this._renderDisplay.texture = null
			this._renderDisplay.x = 0
			this._renderDisplay.y = 0
			this._renderDisplay.visible = false
		} else {
			this._renderDisplay.texture = null
			this._renderDisplay.x = 0
			this._renderDisplay.y = 0
			this._renderDisplay.visible = false
		}
	}

	protected override _updateMesh(): void {
		const scale = (this as any)._armature._armatureData.scale
		const deformVertices = (this as any)._displayFrame.deformVertices
		const bones = (this as any)._geometryBones
		const geometryData = (this as any)._geometryData
		const weightData = geometryData.weight
		const hasDeform = deformVertices.length > 0 && geometryData.inheritDeform
		const meshDisplay = this._renderDisplay
		if (weightData !== null) {
			const data = geometryData.data
			const intArray = data.intArray
			const floatArray = data.floatArray
			const vertexCount = intArray[geometryData.offset + 0]
			let weightFloatOffset = intArray[weightData.offset + 1]
			if (weightFloatOffset < 0) weightFloatOffset += 65536
			for (
				let i = 0, iD = 0, iB = weightData.offset + 2 + bones.length, iV = weightFloatOffset, iF = 0;
				i < vertexCount;
				++i
			) {
				const boneCount = intArray[iB++]
				let xG = 0
				let yG = 0
				for (let j = 0; j < boneCount; ++j) {
					const boneIndex = intArray[iB++]
					const bone = bones[boneIndex]
					if (bone !== null) {
						const matrix = bone.globalTransformMatrix
						const weight = floatArray[iV++]
						let xL = floatArray[iV++] * scale
						let yL = floatArray[iV++] * scale
						if (hasDeform) {
							xL += deformVertices[iF++]
							yL += deformVertices[iF++]
						}
						xG += (matrix.a * xL + matrix.c * yL + matrix.tx) * weight
						yG += (matrix.b * xL + matrix.d * yL + matrix.ty) * weight
					}
				}
				meshDisplay.vertices[iD++] = xG
				meshDisplay.vertices[iD++] = yG
			}
		} else {
			const isSurface = (this as any)._parent._boneData.type !== 0
			const data = geometryData.data
			const intArray = data.intArray
			const floatArray = data.floatArray
			const vertexCount = intArray[geometryData.offset + 0]
			let vertexOffset = intArray[geometryData.offset + 2]
			if (vertexOffset < 0) vertexOffset += 65536
			for (let i = 0, l = vertexCount * 2; i < l; i += 2) {
				let x = floatArray[vertexOffset + i] * scale
				let y = floatArray[vertexOffset + i + 1] * scale
				if (hasDeform) {
					x += deformVertices[i]
					y += deformVertices[i + 1]
				}
				if (isSurface) {
					const matrix = (this as any)._parent._getGlobalTransformMatrix(x, y)
					meshDisplay.vertices[i] = matrix.a * x + matrix.c * y + matrix.tx
					meshDisplay.vertices[i + 1] = matrix.b * x + matrix.d * y + matrix.ty
				} else {
					meshDisplay.vertices[i] = x
					meshDisplay.vertices[i + 1] = y
				}
			}
		}
	}

	protected override _updateTransform(): void {
		this.updateGlobalTransform()
		const transform = (this as any).global
		if (this._renderDisplay === this._rawDisplay || this._renderDisplay === this._meshDisplay) {
			const x =
				transform.x -
				((this as any).globalTransformMatrix.a * (this as any)._pivotX +
					(this as any).globalTransformMatrix.c * (this as any)._pivotY)
			const y =
				transform.y -
				((this as any).globalTransformMatrix.b * (this as any)._pivotX +
					(this as any).globalTransformMatrix.d * (this as any)._pivotY)
			this._renderDisplay.setTransform(
				x,
				y,
				transform.scaleX * this._textureScale,
				transform.scaleY * this._textureScale,
				transform.rotation,
				-transform.skew,
				0,
			)
		} else {
			this._renderDisplay.position.set(transform.x, transform.y)
			this._renderDisplay.rotation = transform.rotation
			this._renderDisplay.skew.set(-transform.skew, 0)
			this._renderDisplay.scale.set(transform.scaleX, transform.scaleY)
		}
	}

	protected override _identityTransform(): void {
		this._renderDisplay.setTransform(0, 0, 1, 1, 0, 0, 0)
	}
}

/**
 * A DragonBones factory that builds Pixi display objects and correctly wires
 * the atlas renderTexture AFTER sub-textures are parsed.
 */
export class DragonBonesPixiFactory extends BaseFactory {
	constructor(dataParser?: any) {
		super(dataParser ?? null)
		// Per-instance DragonBones/world clock so scenes stay isolated (a shared
		// static clock can leave the first cold mount unwarmed).
		;(this as any)._dragonBones = new DragonBones(new DragonBonesArmatureDisplay())
	}

	protected override _buildTextureAtlasData(
		textureAtlasData: any,
		_textureAtlas: any,
	): any {
		if (textureAtlasData) return textureAtlasData
		return BaseObject.borrowObject(DragonBonesTextureAtlasData)
	}

	override parseTextureAtlasData(
		rawData: any,
		textureAtlas: any,
		name: string | null = null,
		scale = 1.0,
	): any {
		const textureAtlasData = this._buildTextureAtlasData(null, textureAtlas)
		if (textureAtlasData !== null) textureAtlasData.autoSearch = true
		;(this as any)._dataParser.parseTextureAtlasData(rawData, textureAtlasData, scale)
		this.addTextureAtlasData(textureAtlasData, name)
		// Fix: assign the renderTexture AFTER the sub-textures exist so the
		// setter actually populates every sub-texture's Pixi texture.
		if (textureAtlasData !== null) {
			;(textureAtlasData as any).renderTextureValue = textureAtlas
		}
		return textureAtlasData
	}

	protected override _buildArmature(dataPackage: any): any {
		const armature = BaseObject.borrowObject(Armature)
		const armatureDisplay = new DragonBonesArmatureDisplay()
		armature.init(
			dataPackage.armature,
			armatureDisplay,
			armatureDisplay,
			(this as any)._dragonBones,
		)
		return armature
	}

	protected override _buildSlot(_dataPackage: any, slotData: any, armature: any): any {
		const slot = BaseObject.borrowObject(DragonBonesSlot)
		slot.init(slotData, armature, new Sprite(Texture.EMPTY), new SimpleMesh())
		return slot
	}

	buildArmatureDisplay(
		armatureName: string,
		dragonBonesName = "",
		skinName = "",
		textureAtlasName = "",
	): DragonBonesArmatureDisplay | null {
		const armature = this.buildArmature(armatureName, dragonBonesName, skinName, textureAtlasName)
		if (armature === null) return null
		;(this as any)._dragonBones.clock.add(armature)
		return armature.display as DragonBonesArmatureDisplay
	}

	/** Advance the world clock that drives every built armature. */
	advanceTime(passedTime: number): void {
		;(this as any)._dragonBones.clock.advanceTime(passedTime)
	}
}
