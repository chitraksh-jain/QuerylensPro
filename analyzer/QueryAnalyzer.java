import java.util.Scanner;

public class QueryAnalyzer {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        if (!scanner.hasNext()) {
            printJson("F", "HIGH", "Error: No input received");
            return;
        }

   
        StringBuilder rawBuilder = new StringBuilder();
        while (scanner.hasNextLine()) {
            rawBuilder.append(scanner.nextLine());
        }
        String rawJson = rawBuilder.toString();

       
        String cleanJson = rawJson.toUpperCase()
                                  .replace(" ", "")
                                  .replace("\n", "")
                                  .replace("\r", "")
                                  .replace("\"", "")
                                  .replace("\\", ""); 

        
        boolean isFullScan = cleanJson.contains("ACCESS_TYPE:ALL") || 
                             cleanJson.contains("TYPE:ALL");

        boolean isRange = cleanJson.contains("ACCESS_TYPE:RANGE") || 
                          cleanJson.contains("TYPE:RANGE");

       
        if (isFullScan) {
            printJson("F", "HIGH", "CRITICAL: Full Table Scan detected! You are reading the entire table (Access Type: ALL).");
        } 
        else if (isRange) {
            printJson("B", "MODERATE", "Range scan detected. Better than a Full Scan.");
        }
        else {
           
            printJson("A", "LOW", "Query is optimized (Const/Ref/Index lookup).");
        }
    }

    private static void printJson(String score, String risk, String suggestion) {
        System.out.println("{");
        System.out.println("  \"score\": \"" + score + "\",");
        System.out.println("  \"risk\": \"" + risk + "\",");
        System.out.println("  \"suggestion\": \"" + suggestion + "\"");
        System.out.println("}");
    }
}