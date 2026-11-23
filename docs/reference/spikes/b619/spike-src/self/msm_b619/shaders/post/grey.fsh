#version 330
#extension GL_ARB_separate_shader_objects : require

uniform sampler2D InSampler;

layout(location = 0) in vec2 texCoord;
layout(location = 0) out vec4 fragColor;

void main() {
    vec4 c = texture(InSampler, texCoord);
    float g = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    fragColor = vec4(vec3(g), 1.0);
}