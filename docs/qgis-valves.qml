<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<qgis version="3.34" styleCategories="Symbology|Fields">
  <renderer-v2 type="categorizedSymbol" attr="network_level" symbollevels="0" enableorderby="0">
    <categories>
      <category value="main" label="Hovedhane" symbol="0" render="true"/>
      <category value="distribution" label="Fordelingshane" symbol="1" render="true"/>
      <category value="service" label="Stikhane" symbol="2" render="true"/>
      <category value="" label="Ikke kategoriseret" symbol="3" render="true"/>
    </categories>
    <symbols>
      <symbol type="marker" name="0" alpha="1" clip_to_extent="1" force_rhr="0">
        <layer class="SimpleMarker" enabled="1" pass="0" locked="0">
          <Option type="Map">
            <Option name="color" type="QString" value="29,140,255,255"/>
            <Option name="name" type="QString" value="circle"/>
            <Option name="outline_color" type="QString" value="8,60,115,255"/>
            <Option name="outline_width" type="QString" value="0.5"/>
            <Option name="size" type="QString" value="3.5"/>
          </Option>
        </layer>
      </symbol>
      <symbol type="marker" name="1" alpha="1" clip_to_extent="1" force_rhr="0">
        <layer class="SimpleMarker" enabled="1" pass="0" locked="0">
          <Option type="Map">
            <Option name="color" type="QString" value="245,158,11,255"/>
            <Option name="name" type="QString" value="circle"/>
            <Option name="outline_color" type="QString" value="107,65,0,255"/>
            <Option name="outline_width" type="QString" value="0.5"/>
            <Option name="size" type="QString" value="3.5"/>
          </Option>
        </layer>
      </symbol>
      <symbol type="marker" name="2" alpha="1" clip_to_extent="1" force_rhr="0">
        <layer class="SimpleMarker" enabled="1" pass="0" locked="0">
          <Option type="Map">
            <Option name="color" type="QString" value="84,213,198,255"/>
            <Option name="name" type="QString" value="circle"/>
            <Option name="outline_color" type="QString" value="22,100,94,255"/>
            <Option name="outline_width" type="QString" value="0.5"/>
            <Option name="size" type="QString" value="3.5"/>
          </Option>
        </layer>
      </symbol>
      <symbol type="marker" name="3" alpha="1" clip_to_extent="1" force_rhr="0">
        <layer class="SimpleMarker" enabled="1" pass="0" locked="0">
          <Option type="Map">
            <Option name="color" type="QString" value="244,185,66,255"/>
            <Option name="name" type="QString" value="circle"/>
            <Option name="outline_color" type="QString" value="74,49,0,255"/>
            <Option name="outline_width" type="QString" value="0.5"/>
            <Option name="size" type="QString" value="3.5"/>
          </Option>
        </layer>
      </symbol>
    </symbols>
    <source-symbol>
      <symbol type="marker" name="0" alpha="1" clip_to_extent="1" force_rhr="0">
        <layer class="SimpleMarker" enabled="1" pass="0" locked="0">
          <Option type="Map">
            <Option name="color" type="QString" value="244,185,66,255"/>
            <Option name="name" type="QString" value="circle"/>
            <Option name="outline_color" type="QString" value="74,49,0,255"/>
            <Option name="size" type="QString" value="3.5"/>
          </Option>
        </layer>
      </symbol>
    </source-symbol>
  </renderer-v2>
  <fieldConfiguration>
    <field name="network_level" configurationFlags="None">
      <editWidget type="ValueMap">
        <config>
          <Option type="Map">
            <Option name="map" type="Map">
              <Option name="Hovedhane" type="QString" value="main"/>
              <Option name="Fordelingshane" type="QString" value="distribution"/>
              <Option name="Stikhane" type="QString" value="service"/>
            </Option>
          </Option>
        </config>
      </editWidget>
    </field>
  </fieldConfiguration>
</qgis>
