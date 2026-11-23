#version 330
#extension GL_ARB_separate_shader_objects : require

uniform sampler2D InSampler;

layout(location = 0) in vec2 texCoord;
layout(location = 0) out vec4 fragColor;

layout(std140) uniform SamplerInfo {
    vec2 OutSize;
    vec2 InSize;
};

const float k = 2;

void main() {
    vec2 o = vec2(k, 0.0) / InSize;
    fragColor = vec4(texture(InSampler, texCoord - o).r, texture(InSampler, texCoord).g, texture(InSampler, texCoord + o).b, 1.0);
}