#version 330
#extension GL_ARB_separate_shader_objects : require

uniform sampler2D InSampler;

layout(location = 0) in vec2 texCoord;
layout(location = 0) out vec4 fragColor;

layout(std140) uniform SamplerInfo {
    vec2 OutSize;
    vec2 InSize;
};

void main() {
    vec2 cell = floor(texCoord * OutSize / 4) * 4 / OutSize;
    fragColor = texture(InSampler, cell);
}