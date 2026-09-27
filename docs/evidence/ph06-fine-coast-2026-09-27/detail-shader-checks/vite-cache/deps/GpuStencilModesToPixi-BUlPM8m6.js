import { Vt as warn, et as getAttributeInfoFromFormat } from "./ParticleBuffer-sr-KNQeB.js";
import { F as STENCIL_MODES } from "./GCManagedHash-B-befWOL.js";
//#region node_modules/pixi.js/lib/rendering/high-shader/shader-bits/localUniformBit.mjs
var localUniformBit = {
	name: "local-uniform-bit",
	vertex: {
		header: `

            struct LocalUniforms {
                uTransformMatrix:mat3x3<f32>,
                uColor:vec4<f32>,
                uRound:f32,
            }

            @group(1) @binding(0) var<uniform> localUniforms : LocalUniforms;
        `,
		main: `
            vColor *= localUniforms.uColor;
            modelMatrix *= localUniforms.uTransformMatrix;
        `,
		end: `
            if(localUniforms.uRound == 1)
            {
                vPosition = vec4(roundPixels(vPosition.xy, globalUniforms.uResolution), vPosition.zw);
            }
        `
	}
};
var localUniformBitGroup2 = {
	...localUniformBit,
	vertex: {
		...localUniformBit.vertex,
		header: localUniformBit.vertex.header.replace("group(1)", "group(2)")
	}
};
var localUniformBitGl = {
	name: "local-uniform-bit",
	vertex: {
		header: `

            uniform mat3 uTransformMatrix;
            uniform vec4 uColor;
            uniform float uRound;
        `,
		main: `
            vColor *= uColor;
            modelMatrix = uTransformMatrix;
        `,
		end: `
            if(uRound == 1.)
            {
                gl_Position.xy = roundPixels(gl_Position.xy, uResolution);
            }
        `
	}
};
//#endregion
//#region node_modules/pixi.js/lib/rendering/high-shader/shader-bits/textureBit.mjs
var textureBit = {
	name: "texture-bit",
	vertex: {
		header: `

        struct TextureUniforms {
            uTextureMatrix:mat3x3<f32>,
        }

        @group(2) @binding(2) var<uniform> textureUniforms : TextureUniforms;
        `,
		main: `
            uv = (textureUniforms.uTextureMatrix * vec3(uv, 1.0)).xy;
        `
	},
	fragment: {
		header: `
            @group(2) @binding(0) var uTexture: texture_2d<f32>;
            @group(2) @binding(1) var uSampler: sampler;


        `,
		main: `
            outColor = textureSample(uTexture, uSampler, vUV);
        `
	}
};
var textureBitGl = {
	name: "texture-bit",
	vertex: {
		header: `
            uniform mat3 uTextureMatrix;
        `,
		main: `
            uv = (uTextureMatrix * vec3(uv, 1.0)).xy;
        `
	},
	fragment: {
		header: `
        uniform sampler2D uTexture;


        `,
		main: `
            outColor = texture(uTexture, vUV);
        `
	}
};
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/gl/shader/program/ensureAttributes.mjs
function ensureAttributes(geometry, extractedData) {
	for (const i in geometry.attributes) {
		const attribute = geometry.attributes[i];
		const attributeData = extractedData[i];
		if (attributeData) {
			attribute.format ?? (attribute.format = attributeData.format);
			attribute.offset ?? (attribute.offset = attributeData.offset);
			attribute.instance ?? (attribute.instance = attributeData.instance);
		} else warn(`Attribute ${i} is not present in the shader, but is present in the geometry. Unable to infer attribute details.`);
	}
	ensureStartAndStride(geometry);
}
function ensureStartAndStride(geometry) {
	const { buffers, attributes } = geometry;
	const tempStride = {};
	const tempStart = {};
	for (const j in buffers) {
		const buffer = buffers[j];
		tempStride[buffer.uid] = 0;
		tempStart[buffer.uid] = 0;
	}
	for (const j in attributes) {
		const attribute = attributes[j];
		tempStride[attribute.buffer.uid] += getAttributeInfoFromFormat(attribute.format).stride;
	}
	for (const j in attributes) {
		const attribute = attributes[j];
		attribute.stride ?? (attribute.stride = tempStride[attribute.buffer.uid]);
		attribute.start ?? (attribute.start = tempStart[attribute.buffer.uid]);
		tempStart[attribute.buffer.uid] += getAttributeInfoFromFormat(attribute.format).stride;
	}
}
//#endregion
//#region node_modules/pixi.js/lib/rendering/renderers/gpu/state/GpuStencilModesToPixi.mjs
var GpuStencilModesToPixi = [];
GpuStencilModesToPixi[STENCIL_MODES.NONE] = void 0;
GpuStencilModesToPixi[STENCIL_MODES.DISABLED] = {
	stencilWriteMask: 0,
	stencilReadMask: 0
};
GpuStencilModesToPixi[STENCIL_MODES.RENDERING_MASK_ADD] = {
	stencilFront: {
		compare: "equal",
		passOp: "increment-clamp"
	},
	stencilBack: {
		compare: "equal",
		passOp: "increment-clamp"
	}
};
GpuStencilModesToPixi[STENCIL_MODES.RENDERING_MASK_REMOVE] = {
	stencilFront: {
		compare: "equal",
		passOp: "decrement-clamp"
	},
	stencilBack: {
		compare: "equal",
		passOp: "decrement-clamp"
	}
};
GpuStencilModesToPixi[STENCIL_MODES.MASK_ACTIVE] = {
	stencilWriteMask: 0,
	stencilFront: {
		compare: "equal",
		passOp: "keep"
	},
	stencilBack: {
		compare: "equal",
		passOp: "keep"
	}
};
GpuStencilModesToPixi[STENCIL_MODES.INVERSE_MASK_ACTIVE] = {
	stencilWriteMask: 0,
	stencilFront: {
		compare: "not-equal",
		passOp: "keep"
	},
	stencilBack: {
		compare: "not-equal",
		passOp: "keep"
	}
};
//#endregion
export { localUniformBit as a, textureBitGl as i, ensureAttributes as n, localUniformBitGl as o, textureBit as r, localUniformBitGroup2 as s, GpuStencilModesToPixi as t };
