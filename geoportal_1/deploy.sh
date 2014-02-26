#!/bin/bash

service tomcat6 stop

rm -Rf /home/gis/src/OGP2/geoportal_1/target/
rm -f /var/lib/ogp/opengeoportal.war
rm -Rf /var/lib/tomcat6/webapps/ogp/

mvn clean install

\cp -f target/opengeoportal.war /var/lib/ogp/opengeoportal.war

chown -R tomcat:tomcat /var/lib/ogp/

service tomcat6 start
