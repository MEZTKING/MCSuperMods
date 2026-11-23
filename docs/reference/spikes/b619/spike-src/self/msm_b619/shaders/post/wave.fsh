#version 330
#extension GL_ARB_separate_shader_objects : require

uniform sampler2D InSampler;

layout(location = 0) in vec2 texCoord;
layout(location = 0) out vec4 fragColor;

#include <minecraft:globals.glsl>

void main() {
    vec2 uv = texCoord + vec2(sin(texCoord.y * 40 + GameTime * 2000) * 0.004, 0.0);
    fragColor = texture(InSampler, uv);
}