#version 330
#extension GL_ARB_separate_shader_objects : require

uniform sampler2D InSampler;

layout(location = 0) in vec2 texCoord;
layout(location = 0) out vec4 fragColor;

void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    vec3 a = texelFetch(InSampler, p, 0).rgb;
    vec3 b = texelFetch(InSampler, p + ivec2(1, 0), 0).rgb;
    vec3 c = texelFetch(InSampler, p + ivec2(0, 1), 0).rgb;
    float e = length(a - b) + length(a - c);
    fragColor = vec4(vec3(e), 1.0);
}