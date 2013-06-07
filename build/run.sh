rm -rf release;
( cd ../jbrowse/src/util/buildscripts/ \
    && node ../../dojo/dojo.js load=build --profile ../../../../webapollo/build.profile.js --release \
)
