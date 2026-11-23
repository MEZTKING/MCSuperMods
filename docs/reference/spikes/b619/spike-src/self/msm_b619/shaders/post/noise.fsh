#version 330
#extension GL_ARB_separate_shader_objects : require

uniform sampler2D InSampler;

layout(location = 0) in vec2 texCoord;
layout(location = 0) out vec4 fragColor;

float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec4 c = texture(InSampler, texCoord);
    fragColor = vec4(c.rgb + (rand(texCoord) - 0.5) * 0.08, 1.0);
}