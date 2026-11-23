#version 330
#extension GL_ARB_separate_shader_objects : require

uniform sampler2D InSampler;

layout(location = 0) in vec2 texCoord;
layout(location = 0) out vec4 fragColor;

void main() {
    vec3 c = texture(InSampler, texCoord).rgb;
    float d = length(texCoord - vec2(0.5));
    fragColor = vec4(c * smoothstep(0.8, 0.3, d), 1.0);
}