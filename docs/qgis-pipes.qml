<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<qgis version="3.34" styleCategories="Symbology|Fields">
  <renderer-v2 type="categorizedSymbol" attr="pipe_type" symbollevels="0" enableorderby="0">
    <categories>
      <category value="main" label="Hovedforsyningsledning" symbol="0" render="true"/>
      <category value="distribution" label="Fordelingsledning" symbol="1" render="true"/>
      <category value="service" label="Stikledning" symbol="2" render="true"/>
    </categories>
    <symbols>
      <symbol type="line" name="0" alpha="1" clip_to_extent="1" force_rhr="0">
        <layer class="SimpleLine" enabled="1" pass="0" locked="0">
          <Option type="Map">
            <Option name="line_color" type="QString" value="29,140,255,255"/>
            <Option name="line_style" type="QString" value="solid"/>
            <Option name="line_width" type="QString" value="1.2"/>
            <Option name="line_width_unit" type="QString" value="MM"/>
          </Option>
        </layer>
      </symbol>
      <symbol type="line" name="1" alpha="1" clip_to_extent="1" force_rhr="0">
        <layer class="SimpleLine" enabled="1" pass="0" locked="0">
          <Option type="Map">
            <Option name="line_color" type="QString" value="245,158,11,255"/>
            <Option name="line_style" type="QString" value="solid"/>
            <Option name="line_width" type="QString" value="0.9"/>
            <Option name="line_width_unit" type="QString" value="MM"/>
          </Option>
        </layer>
      </symbol>
      <symbol type="line" name="2" alpha="1" clip_to_extent="1" force_rhr="0">
        <layer class="SimpleLine" enabled="1" pass="0" locked="0">
          <Option type="Map">
            <Option name="customdash" type="QString" value="2;1.5"/>
            <Option name="customdash_unit" type="QString" value="MM"/>
            <Option name="line_color" type="QString" value="84,213,198,255"/>
            <Option name="line_style" type="QString" value="dash"/>
            <Option name="line_width" type="QString" value="0.7"/>
            <Option name="line_width_unit" type="QString" value="MM"/>
            <Option name="use_custom_dash" type="QString" value="1"/>
          </Option>
        </layer>
      </symbol>
    </symbols>
    <source-symbol>
      <symbol type="line" name="0" alpha="1" clip_to_extent="1" force_rhr="0">
        <layer class="SimpleLine" enabled="1" pass="0" locked="0">
          <Option type="Map">
            <Option name="line_color" type="QString" value="29,140,255,255"/>
            <Option name="line_width" type="QString" value="0.7"/>
            <Option name="line_width_unit" type="QString" value="MM"/>
          </Option>
        </layer>
      </symbol>
    </source-symbol>
  </renderer-v2>
  <fieldConfiguration>
    <field name="pipe_type" configurationFlags="None">
      <editWidget type="ValueMap">
        <config>
          <Option type="Map">
            <Option name="map" type="Map">
              <Option name="Hovedforsyningsledning" type="QString" value="main"/>
              <Option name="Fordelingsledning" type="QString" value="distribution"/>
              <Option name="Stikledning" type="QString" value="service"/>
            </Option>
          </Option>
        </config>
      </editWidget>
    </field>
  </fieldConfiguration>
</qgis>
