# Analytics Tagging Fixes Report

- Date: 20260709
- Mode: live
- Location websites scanned: 12917
- Google SERP wrappers before: 15
- Google SERP wrappers updated: 15
- Google SERP wrappers after: 0

## Backup Tables

- `fountain_raw.locations_backup_20260709_google_serp_wrapper_hygiene`
- `fountain_raw.location_website_serp_wrapper_audit_20260709`

## Write Scope

- Updated only `fountain.locations.website` rows that matched Google SERP redirect wrappers.
- Did not touch offerings, reviews, tags, organizations, or practitioners.

## Changed Location Samples

| id | slug | old | new |
| --- | --- | --- | --- |
| 10028 | david-b-chernoff-md-staunton | /url?q=https%3A%2F%2Fwww.carilionclinic.org%2Fproviders%2Fdavid-b-chernoff-md&opi=79508299&sa=U&ved=0ahUKEwj2yKnSxZqSAxUiBrwBHTM7L1wQ61gIEigO&usg=AOvVaw226u_XoCx6dECb5uNa38OD | https://www.carilionclinic.org/providers/david-b-chernoff-md |
| 10062 | dollar-general-hopewell | /url?q=https://www.dollargeneral.com/store-directory/va/hopewell/2079&opi=79508299&sa=U&ved=0ahUKEwicwpeaxZqSAxXBGFkFHaq1NOIQ61gIEygO&usg=AOvVaw1B8JlzO_1IlQXCcHVMqpP2 | https://www.dollargeneral.com/store-directory/va/hopewell/2079 |
| 10318 | green-bay-integrative-health | /url?q=http://www.greenbayintegrativehealth.com/&opi=79508299&sa=U&ved=0ahUKEwjqqa-FiO2RAxWGAxAIHX5IBGsQ61gIEigO&usg=AOvVaw3z_hSjFVilV6_ftUQ2wCtj | http://www.greenbayintegrativehealth.com/ |
| 10545 | kellogg-clinic-wichita | /url?q=http://www.kelloggclinic.com/&opi=79508299&sa=U&ved=0ahUKEwjK2M-rtZeSAxUInWoFHRRkEPIQ61gIEigO&usg=AOvVaw2MzJGKGt_gX-m-5I10ZitR | http://www.kelloggclinic.com/ |
| 10660 | lyrad-health-grand-prairie | /url?q=https://lyradhealth.com/&opi=79508299&sa=U&ved=0ahUKEwjH8MDczKaRAxVIEFkFHcDdGN0Q61gIEigO&usg=AOvVaw0OVh8y2M4xev5aQyz1-NTR | https://lyradhealth.com/ |
| 10693 | mayo-clinic-fayetteville | /url?q=https://www.mayoclinic.org/&opi=79508299&sa=U&ved=0ahUKEwi3r-_2h-2RAxX4nGoFHTh4C6YQ61gIDigK&usg=AOvVaw2ECor7g52EePHn6nMrB0QH | https://www.mayoclinic.org/ |
| 10991 | optimize-u-fayetteville-hormone-cryotherapy-clinic | /url?q=https://optimizeucenters.com/locations/fayetteville-north-carolina/&opi=79508299&sa=U&ved=0ahUKEwjj_pLm_NORAxV3ODQIHfXAEccQ61gIEigO&usg=AOvVaw2kula4RpEQW3nQlJ5-H8CO | https://optimizeucenters.com/locations/fayetteville-north-carolina/ |
| 11103 | peak-iv-hydration-knoxville | /url?q=http://www.peakivhydration.com/&opi=79508299&sa=U&ved=0ahUKEwimzIDzzKaRAxVcHRAIHR0hHRkQ61gIEigO&usg=AOvVaw3qePXhPVjWB5FQu4j9XGCy | http://www.peakivhydration.com/ |
| 11132 | physicians-treatment-center-lynchburg | /url?q=http://www.ptclynchburg.com/&opi=79508299&sa=U&ved=0ahUKEwjx78KdxZqSAxVlLRAIHa11OgkQ61gIEigO&usg=AOvVaw05rvJ7LwitmrMhOF44a5rP | http://www.ptclynchburg.com/ |
| 11267 | qc-kinetix-lansing | /url?q=https%3A%2F%2Fqckinetix.com%2Flansing%2F&opi=79508299&sa=U&ved=0ahUKEwijhbaLiO2RAxXMI0QIHcoFM20Q61gIEigO&usg=AOvVaw3bYkxHFoUVAEl5MKcq6v-r | https://qckinetix.com/lansing/ |
| 11668 | riordan-clinic-wichita | /url?q=https://riordanclinic.org/&opi=79508299&sa=U&ved=0ahUKEwjMgsCctZeSAxU6hu4BHQpgBhcQ61gIEigO&usg=AOvVaw1Zvdy3OJX1-omkBVMGeVJ2 | https://riordanclinic.org/ |
| 12725 | tri-med-integrative-psychiatry-sleep-medicine-frisco | /url?q=https://www.trimedhealth.com/contact-tri-med-health-frisco-texas/&opi=79508299&sa=U&ved=0ahUKEwjC75LYzKaRAxWKkYkEHeIjG7cQ61gIEigO&usg=AOvVaw3BKd8g3KYUq-Cgi3IZGNXB | https://www.trimedhealth.com/contact-tri-med-health-frisco-texas/ |
| 12855 | united-medical-imaging-of-huntington-beach | /url?q=http://umih.com/&opi=79508299&sa=U&ved=0ahUKEwjnkPnjzKaRAxVLLUQIHf1hFYQQ61gIEigO&usg=AOvVaw1i_G2-uldzTusM7IxZ2yRa | http://umih.com/ |
| 12945 | valencia-canine-rehabilitation-center-santa-clarita | /url?q=https://www.bestvalenciavet.com/site/rehabilitation-services-santa-clarita&opi=79508299&sa=U&ved=0ahUKEwitlOzz9OORAxVjLEQIHbMAHCgQ61gIEigO&usg=AOvVaw2azutLK1TGK2-hFDLr0tjd | https://www.bestvalenciavet.com/site/rehabilitation-services-santa-clarita |
| 13090 | vitality-testosterone-replacement-therapy-clinic-norfolk | /url?q=https%3A%2F%2Fvitalitytestosteronereplacementtherapy.com%2Flocations%2Fnorfolk-va%2F&opi=79508299&sa=U&ved=0ahUKEwj3laC0xZqSAxVbnSYFHf3pEi8Q61gIECgN&usg=AOvVaw10aFVJz3BfqMEU_t8zVCAu | https://vitalitytestosteronereplacementtherapy.com/locations/norfolk-va/ |

