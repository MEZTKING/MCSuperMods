#!/bin/bash
# Builds the throwaway spike mod against one version's server jar, libraries and Fabric API modules (javac only).
set -e
S=<scratchpad>/b720
v=$1
J=/root/jdk25/jdk-25.0.5.1+2/bin
CP=$(ls $S/libs/$v/META-INF/versions/*/server-*.jar)
for j in $(find $S/libs/$v/META-INF/libraries -name "*.jar") $S/libs/fapi-$v/META-INF/jars/*.jar ~/.gradle/caches/modules-2/files-2.1/net.fabricmc/fabric-loader/0.20.1/*/fabric-loader-0.20.1.jar; do CP=$CP:$j; done
out=$S/build/$v
rm -rf $out && mkdir -p $out/classes
$J/javac -nowarn --release 25 -cp "$CP" -d $out/classes $S/src/mod/b720/*.java 2>&1 | grep -v JAVA_TOOL || true
cp $S/src/mod/fabric.mod.json $out/classes/
(cd $out/classes && $J/jar cf ../b720spike.jar .) 2>&1 | grep -v JAVA_TOOL || true
ls -la $out/b720spike.jar
