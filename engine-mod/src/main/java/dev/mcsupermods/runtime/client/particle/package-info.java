/**
 * The client half of project particles (ADR 0080 D4; B349): {@link
 * dev.mcsupermods.runtime.client.particle.ParticleLook} (the knobs of a {@code msm:particle} definition with their
 * defaults resolved, and the pure rules for lifetime, frame, size, colour, alpha, spin and the movement of a particle
 * that does not collide; no Minecraft client types, tied to the app's preview by {@code fixtures/particle-look}),
 * {@link dev.mcsupermods.runtime.client.particle.MsmParticle} (one camera-facing quad that vanilla's {@code tick()}
 * moves and {@code ParticleLook} dresses) and {@link dev.mcsupermods.runtime.client.particle.MsmParticleProvider}
 * (the provider registered for every project type; it never throws). Written from ADR 0080 D1 and D4, never from a
 * vanilla particle class. Every member used is the same on 26.3 and 26.4-snapshot-7: nothing here constructs or reads
 * {@code SingleQuadParticle.Layer}'s constructors or accessors, {@code uvFlip}, {@code SpriteSet.size()},
 * {@code ParticleLimit} or {@code ParticleResources}. Registration and the definitions come with B350.
 */
package dev.mcsupermods.runtime.client.particle;
