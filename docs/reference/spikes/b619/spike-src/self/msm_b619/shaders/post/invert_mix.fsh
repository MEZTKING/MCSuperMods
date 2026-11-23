#version 330
#extension GL_ARB_separate_shader_objects : require

uniform sampler2D InSampler;

layout(location = 0) in vec2 texCoord;
layout(location = 0) out vec4 fragColor;

layout(std140) uniform MixConfig {
    float Strength;
};

void main() {
    vec4 c = texture(InSampler, texCoord);
    fragColor = vec4(mix(c.rgb, 1.0 - c.rgb, Strength), c.a);
}